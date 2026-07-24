import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AddTransactionSheet } from "@/components/add-transaction-sheet"
import { renderWithIntl as render } from "@/lib/test/render"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }))
afterEach(() => vi.unstubAllGlobals())

const ACCOUNTS = [{ id: "a1", name: "Cash", isDefault: true }]

function bodyOf(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
}

describe("AddTransactionSheet", () => {
  it("posts an expense (negative amount) with the chosen type", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: "t1" }) }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    render(<AddTransactionSheet accounts={ACCOUNTS} />)

    await user.click(screen.getByRole("button", { name: /add transaction/i }))
    await user.type(await screen.findByLabelText(/merchant/i), "Cash lunch")
    await user.type(screen.getByLabelText(/amount/i), "1500")
    await user.selectOptions(screen.getByLabelText(/expense type/i), "Necessary")
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions",
      expect.objectContaining({ method: "POST" })
    )
    expect(bodyOf(fetchMock)).toMatchObject({
      accountId: "a1",
      merchant: "Cash lunch",
      amount: -1500,
      expenseType: "Necessary",
    })
  })

  it("posts income as a positive amount and no expense type", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: "t2" }) }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    render(<AddTransactionSheet accounts={ACCOUNTS} />)

    await user.click(screen.getByRole("button", { name: /add transaction/i }))
    await user.selectOptions(screen.getByLabelText(/expense or income/i), "income")
    await user.type(await screen.findByLabelText(/merchant/i), "Refund")
    await user.type(screen.getByLabelText(/amount/i), "5000")
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    const body = bodyOf(fetchMock)
    expect(body).toMatchObject({ accountId: "a1", merchant: "Refund", amount: 5000 })
    expect(body.expenseType).toBeUndefined()
  })

  it("shows an error and stays open when the request fails", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    render(<AddTransactionSheet accounts={ACCOUNTS} />)

    await user.click(screen.getByRole("button", { name: /add transaction/i }))
    await user.type(await screen.findByLabelText(/merchant/i), "X")
    await user.type(screen.getByLabelText(/amount/i), "100")
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})
