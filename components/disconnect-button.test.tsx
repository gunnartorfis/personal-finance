import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import { DisconnectButton } from "@/components/disconnect-button"
import { renderWithIntl as render } from "@/lib/test/render"

afterEach(() => {
  vi.restoreAllMocks()
  refresh.mockClear()
})

describe("DisconnectButton", () => {
  it("asks for confirmation before posting", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"))

    render(
      <DisconnectButton connectionId="c1" institutionName="Landsbankinn" />
    )
    // First click only reveals the confirm affordance — no request yet.
    fireEvent.click(
      screen.getByRole("button", { name: /^disconnect landsbankinn/i })
    )
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole("button", { name: /confirm disconnect landsbankinn/i })
    )
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/open-banking/connections/c1/disconnect",
        { method: "POST" }
      )
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it("can be cancelled without posting", () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"))

    render(<DisconnectButton connectionId="c1" institutionName="Arion" />)
    fireEvent.click(screen.getByRole("button", { name: /^disconnect arion/i }))
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))

    expect(
      screen.getByRole("button", { name: /^disconnect arion/i })
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows an inline error when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("no", { status: 500 })
    )

    render(<DisconnectButton connectionId="c1" institutionName="Kvika" />)
    fireEvent.click(screen.getByRole("button", { name: /^disconnect kvika/i }))
    fireEvent.click(
      screen.getByRole("button", { name: /confirm disconnect kvika/i })
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i)
    expect(refresh).not.toHaveBeenCalled()
  })

  it("clears a prior error when cancelled, so re-opening is clean", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("no", { status: 500 })
    )

    render(<DisconnectButton connectionId="c1" institutionName="Indó" />)
    fireEvent.click(screen.getByRole("button", { name: /^disconnect indó/i }))
    fireEvent.click(
      screen.getByRole("button", { name: /confirm disconnect indó/i })
    )
    expect(await screen.findByRole("alert")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    // Re-enter the confirming state — the stale error must be gone.
    fireEvent.click(screen.getByRole("button", { name: /^disconnect indó/i }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
