import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ReconnectButton } from "@/components/reconnect-button"
import { renderWithIntl as render } from "@/lib/test/render"

// jsdom's window.location.assign is non-configurable, so swap the whole location object per test.
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

describe("ReconnectButton", () => {
  it("posts the stored institution and redirects to the bank's consent URL", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ url: "https://bank/sca" }))
      )

    render(<ReconnectButton institutionName="Landsbankinn" />)
    fireEvent.click(
      screen.getByRole("button", { name: /reconnect landsbankinn/i })
    )

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://bank/sca"))
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    )
    expect(body).toEqual({ institutionName: "Landsbankinn", country: "IS" })
  })

  it("shows an inline error and does not navigate when the connect call fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 })
    )

    render(<ReconnectButton institutionName="Arion" />)
    fireEvent.click(screen.getByRole("button", { name: /reconnect arion/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i)
    expect(assign).not.toHaveBeenCalled()
  })
})
