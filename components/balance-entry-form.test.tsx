import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import { BalanceEntryForm } from "@/components/balance-entry-form"
import type { AccountBalance } from "@/lib/dashboard/net-worth"
import { renderWithIntl as render } from "@/lib/test/render"

const ACCOUNTS: AccountBalance[] = [
  { id: "a1", name: "Checking", balance: 600_000 },
  { id: "a2", name: "Savings", balance: null },
]

afterEach(() => {
  vi.restoreAllMocks()
  refresh.mockReset()
})

function openForm() {
  render(<BalanceEntryForm accounts={ACCOUNTS} />)
  fireEvent.click(screen.getByRole("button", { name: "Update balances" }))
}

describe("BalanceEntryForm", () => {
  it("labels the disclosure 'Add balances' when no account has a balance yet", () => {
    render(<BalanceEntryForm accounts={[{ id: "a1", name: "Checking", balance: null }]} />)
    expect(screen.getByRole("button", { name: "Add balances" })).toBeInTheDocument()
  })

  it("posts only the non-blank balances and refreshes on success", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 201 }))
    openForm()

    // Leave Checking prefilled (600,000), fill Savings, submit.
    fireEvent.change(screen.getByLabelText("Savings"), { target: { value: "400000" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({
      balances: [
        { accountId: "a1", balance: 600000 },
        { accountId: "a2", balance: 400000 },
      ],
    })
  })

  it("surfaces an error and does not refresh when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }))
    openForm()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't save/i)
    expect(refresh).not.toHaveBeenCalled()
  })

  it("clears a stale error banner when the form is closed and reopened", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }))
    openForm()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    fireEvent.click(screen.getByRole("button", { name: "Update balances" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
