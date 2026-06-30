import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ManageSubscription } from "@/components/manage-subscription"

afterEach(() => vi.unstubAllGlobals())

describe("ManageSubscription", () => {
  it("shows Premium with the renewal date and cancels after confirming", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cancelled: true }) })
    vi.stubGlobal("fetch", fetchMock)

    render(
      <ManageSubscription plan="Premium" period="monthly" planRenewsAt="2026-04-15T00:00:00.000Z" />,
    )
    expect(screen.getByText(/Premium/)).toBeInTheDocument()
    expect(screen.getByText(/2026/)).toBeInTheDocument()

    // First click only reveals the confirm step — no POST yet.
    await userEvent.click(screen.getByRole("button", { name: /cancel subscription/i }))
    expect(fetchMock).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: /yes, cancel/i }))
    expect(fetchMock).toHaveBeenCalledWith("/api/billing/cancel", expect.objectContaining({ method: "POST" }))
    expect(await screen.findByText(/cancelled/i)).toBeInTheDocument()
  })

  it("does not cancel if the confirm step is dismissed", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    render(<ManageSubscription plan="Premium" period="monthly" planRenewsAt="2026-04-15T00:00:00.000Z" />)
    await userEvent.click(screen.getByRole("button", { name: /cancel subscription/i }))
    await userEvent.click(screen.getByRole("button", { name: /keep it/i }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /cancel subscription/i })).toBeInTheDocument()
  })

  it("shows the Free plan with no cancel action", () => {
    render(<ManageSubscription plan="Free" period={null} planRenewsAt={null} />)
    expect(screen.getByText(/Free plan/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument()
  })

  it("surfaces an error when cancel fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    render(<ManageSubscription plan="Premium" period="annual" planRenewsAt="2027-01-01T00:00:00.000Z" />)

    await userEvent.click(screen.getByRole("button", { name: /cancel subscription/i }))
    await userEvent.click(screen.getByRole("button", { name: /yes, cancel/i }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})
