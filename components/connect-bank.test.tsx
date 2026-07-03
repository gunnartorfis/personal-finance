import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ConnectBank } from "@/components/connect-bank"
import { renderWithIntl as render } from "@/lib/test/render"

const originalLocation = window.location
let assign: ReturnType<typeof vi.fn>

beforeEach(() => {
  assign = vi.fn()
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { assign },
  })
})

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  })
  vi.restoreAllMocks()
})

/** Route by URL: GET institutions, POST connect. */
function stubFetch(
  overrides: { institutions?: Response; connect?: Response } = {}
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input)
    if (url.includes("/institutions")) {
      return Promise.resolve(
        overrides.institutions ??
          new Response(
            JSON.stringify([
              { name: "Landsbankinn", country: "IS" },
              { name: "Arion", country: "IS" },
            ])
          )
      )
    }
    if (url.includes("/connect") && init?.method === "POST") {
      return Promise.resolve(
        overrides.connect ??
          new Response(JSON.stringify({ url: "https://bank/sca" }))
      )
    }
    return Promise.resolve(new Response("{}"))
  })
}

describe("ConnectBank", () => {
  it("loads institutions, connects the chosen bank, and redirects to consent", async () => {
    const fetchMock = stubFetch()
    render(<ConnectBank />)

    // The picker fills with the loaded banks, defaulting to the first.
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Arion" })).toBeInTheDocument()
    )
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Arion" },
    })
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://bank/sca"))
    const connectCall = fetchMock.mock.calls.find(
      ([u, i]) => String(u).includes("/connect") && i?.method === "POST"
    )
    expect(JSON.parse((connectCall![1] as RequestInit).body as string)).toEqual(
      {
        institutionName: "Arion",
        country: "IS",
      }
    )
  })

  it("shows an inline error and does not navigate when connect fails", async () => {
    stubFetch({ connect: new Response("no", { status: 500 }) })
    render(<ConnectBank />)

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Landsbankinn" })
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i)
    expect(assign).not.toHaveBeenCalled()
  })

  it("surfaces a load failure instead of an empty picker", async () => {
    stubFetch({ institutions: new Response("no", { status: 502 }) })
    render(<ConnectBank />)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn.t load banks/i
    )
  })
})
