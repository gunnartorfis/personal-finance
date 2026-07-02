import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  TransactionsTable,
  type TransactionRow,
} from "@/components/transactions-table"

// The table calls router.refresh() after an inline override settles (to recount the server-derived
// net summary + Rapid review badge); stub it so the component renders outside an app-router context.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }))

afterEach(() => vi.unstubAllGlobals())

const ROWS: TransactionRow[] = [
  {
    id: "t1",
    date: "2026-03-15",
    merchant: "NETFLIX",
    amount: -1990,
    incomeMarked: false,
    classifiedType: "Fixed",
    confidence: 0.9,
    reasoning: "Recurring subscription",
    overrideType: null,
    classificationStatus: "classified",
  },
  {
    id: "t3",
    date: "2026-03-12",
    merchant: "GYM",
    amount: -5000,
    incomeMarked: false,
    classifiedType: "Necessary",
    confidence: 0.6,
    reasoning: null,
    overrideType: "Nice to have", // override wins
    classificationStatus: "classified",
  },
  {
    id: "t2",
    date: "2026-03-10",
    merchant: "SALARY",
    amount: 500000,
    incomeMarked: false,
    classifiedType: "",
    confidence: null,
    reasoning: null,
    overrideType: null,
    classificationStatus: "classified",
  },
]

describe("TransactionsTable", () => {
  it("renders a row per transaction with merchant and a formatted amount", () => {
    render(<TransactionsTable rows={ROWS} currency="ISK" />)
    expect(screen.getByText("NETFLIX")).toBeInTheDocument()
    expect(screen.getByText("SALARY")).toBeInTheDocument()
    // ISK formats with no decimals and a currency marker
    expect(screen.getByText(/1,990/)).toBeInTheDocument()
  })

  it("shows the effective type, with the override winning over the classified type", () => {
    render(<TransactionsTable rows={ROWS} currency="ISK" />)
    const overridden = screen.getByRole("row", { name: /GYM/ })
    expect(within(overridden).getByRole("combobox")).toHaveValue("Nice to have")
    // overridden row exposes a Reset affordance
    expect(
      within(overridden).getByRole("button", { name: /reset/i })
    ).toBeInTheDocument()
  })

  it("gives a credit row an income toggle instead of an expense-type control (ADR-0009)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    render(<TransactionsTable rows={ROWS} currency="ISK" />)

    const credit = screen.getByRole("row", { name: /SALARY/ })
    expect(within(credit).queryByRole("combobox")).not.toBeInTheDocument()

    const toggle = within(credit).getByRole("checkbox", { name: /income/i })
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions/t2/income",
      expect.objectContaining({ method: "PUT" })
    )
    expect(
      within(credit).getByRole("checkbox", { name: /income/i })
    ).toBeChecked()
  })

  it("persists an override change and reflects it on the row", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    render(<TransactionsTable rows={ROWS} currency="ISK" />)

    const row = screen.getByRole("row", { name: /NETFLIX/ })
    await userEvent.selectOptions(
      within(row).getByRole("combobox"),
      "Necessary"
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions/t1/override",
      expect.objectContaining({ method: "PUT" })
    )
    expect(
      await within(row).findByRole("button", { name: /reset/i })
    ).toBeInTheDocument()
  })

  it("flags rows still awaiting classification distinctly from a real split/none", () => {
    const rows: TransactionRow[] = [
      {
        id: "p1",
        date: "2026-03-12",
        merchant: "PENDING CO",
        amount: -100,
        incomeMarked: false,
        classifiedType: null,
        confidence: null,
        reasoning: null,
        overrideType: null,
        classificationStatus: "pending",
      },
      {
        id: "s1",
        date: "2026-03-11",
        merchant: "SPLIT CO",
        amount: -200,
        incomeMarked: false,
        classifiedType: "",
        confidence: 0.5,
        reasoning: null,
        overrideType: null,
        classificationStatus: "classified",
      },
    ]
    render(<TransactionsTable rows={rows} currency="ISK" />)

    const pending = screen.getByRole("row", { name: /PENDING CO/ })
    expect(
      within(pending).getByText(/awaiting classification/i)
    ).toBeInTheDocument()
    const split = screen.getByRole("row", { name: /SPLIT CO/ })
    expect(
      within(split).queryByText(/awaiting classification/i)
    ).not.toBeInTheDocument()
  })

  it("renders an empty state when there are no transactions", () => {
    render(<TransactionsTable rows={[]} currency="ISK" />)
    expect(screen.getByText(/no transactions/i)).toBeInTheDocument()
  })
})
