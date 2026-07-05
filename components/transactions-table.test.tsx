import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  TransactionsTable,
  type CategoryOption,
  type TransactionRow,
} from "@/components/transactions-table"
import { renderWithIntl as render } from "@/lib/test/render"

// The table calls router.refresh() after an inline override settles (to recount the server-derived
// net summary + Rapid review badge); stub it so the component renders outside an app-router context.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }))

afterEach(() => vi.unstubAllGlobals())

/** The per-row "Type" pill is the row's only button; click it to open its action menu. */
async function openRowMenu(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp
) {
  const row = screen.getByRole("row", { name })
  await user.click(within(row).getByRole("button"))
  return row
}

const ROWS: TransactionRow[] = [
  {
    id: "t1",
    date: "2026-03-15",
    merchant: "NETFLIX",
    amount: -1990,
    ownShareAmount: null,
    incomeMarked: false,
    excluded: false,
    exclusionNote: null,
    classifiedType: "Fixed",
    confidence: 0.9,
    reasoning: "Recurring subscription",
    overrideType: null,
    classificationStatus: "classified",
    categoryId: null,
    overrideCategoryId: null,
  },
  {
    id: "t3",
    date: "2026-03-12",
    merchant: "GYM",
    amount: -5000,
    ownShareAmount: null,
    incomeMarked: false,
    excluded: false,
    exclusionNote: null,
    classifiedType: "Necessary",
    confidence: 0.6,
    reasoning: null,
    overrideType: "Nice to have", // override wins
    classificationStatus: "classified",
    categoryId: null,
    overrideCategoryId: null,
  },
  {
    id: "t2",
    date: "2026-03-10",
    merchant: "SALARY",
    amount: 500000,
    ownShareAmount: null,
    incomeMarked: false,
    excluded: false,
    exclusionNote: null,
    classifiedType: "",
    confidence: null,
    reasoning: null,
    overrideType: null,
    classificationStatus: "classified",
    categoryId: null,
    overrideCategoryId: null,
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

  it("shows the effective type on the pill, with the override winning over the classified type", async () => {
    const user = userEvent.setup()
    render(<TransactionsTable rows={ROWS} currency="ISK" />)

    // GYM is classified Necessary but overridden to Nice to have — the pill shows the override.
    const overridden = screen.getByRole("row", { name: /GYM/ })
    expect(
      within(overridden).getByRole("button", { name: /nice to have/i })
    ).toBeInTheDocument()

    // Its menu exposes a Reset back to the AI suggestion (Necessary).
    await openRowMenu(user, /GYM/)
    expect(
      await screen.findByRole("menuitem", { name: /reset to ai.*necessary/i })
    ).toBeInTheDocument()
  })

  it("gives a credit an income checkbox instead of expense types, and no Exclude (ADR-0009)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    render(<TransactionsTable rows={ROWS} currency="ISK" />)

    // The credit's pill reads "Credit", not an expense type.
    const credit = screen.getByRole("row", { name: /SALARY/ })
    expect(
      within(credit).getByRole("button", { name: /^credit$/i })
    ).toBeInTheDocument()

    await openRowMenu(user, /SALARY/)
    const toggle = await screen.findByRole("menuitemcheckbox", {
      name: /count as income/i,
    })
    // A credit is already out of every calculation; Exclude would be a no-op, so it's not offered.
    expect(
      screen.queryByRole("menuitem", { name: /exclude/i })
    ).not.toBeInTheDocument()

    await user.click(toggle)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions/t2/income",
      expect.objectContaining({ method: "PUT" })
    )
    // Marking flips the pill to "Income".
    expect(
      await within(credit).findByRole("button", { name: /^income$/i })
    ).toBeInTheDocument()

    // Debits, by contrast, do offer Exclude.
    await openRowMenu(user, /NETFLIX/)
    expect(
      await screen.findByRole("menuitem", { name: /exclude/i })
    ).toBeInTheDocument()
  })

  it("keeps the Include-only affordance on an already-excluded credit (ADR-0011)", async () => {
    // A credit excluded before this change (or one income-marked then excluded) must still be
    // restorable — the excluded branch shows Include, never the income checkbox.
    const excludedCredit: TransactionRow = {
      id: "t4",
      date: "2026-03-08",
      merchant: "REFUND",
      amount: 12345,
      ownShareAmount: null,
      incomeMarked: false,
      excluded: true,
      exclusionNote: null,
      classifiedType: "",
      confidence: null,
      reasoning: null,
      overrideType: null,
      classificationStatus: "classified",
      categoryId: null,
      overrideCategoryId: null,
    }
    const user = userEvent.setup()
    render(<TransactionsTable rows={[excludedCredit]} currency="ISK" />)

    const row = screen.getByRole("row", { name: /REFUND/ })
    expect(
      within(row).getByRole("button", { name: /excluded/i })
    ).toBeInTheDocument()

    await openRowMenu(user, /REFUND/)
    expect(
      await screen.findByRole("menuitem", { name: /include/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /income/i })
    ).not.toBeInTheDocument()
  })

  it("persists an override change and reflects it on the pill", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    render(<TransactionsTable rows={ROWS} currency="ISK" />)

    await openRowMenu(user, /NETFLIX/)
    await user.click(
      await screen.findByRole("menuitemradio", { name: /necessary/i })
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions/t1/override",
      expect.objectContaining({ method: "PUT" })
    )
    const row = screen.getByRole("row", { name: /NETFLIX/ })
    expect(
      await within(row).findByRole("button", { name: /necessary/i })
    ).toBeInTheDocument()
  })

  it("flags rows still awaiting classification distinctly from a real split/none", () => {
    const rows: TransactionRow[] = [
      {
        id: "p1",
        date: "2026-03-12",
        merchant: "PENDING CO",
        amount: -100,
        ownShareAmount: null,
        incomeMarked: false,
        excluded: false,
        exclusionNote: null,
        classifiedType: null,
        confidence: null,
        reasoning: null,
        overrideType: null,
        classificationStatus: "pending",
        categoryId: null,
        overrideCategoryId: null,
      },
      {
        id: "s1",
        date: "2026-03-11",
        merchant: "SPLIT CO",
        amount: -200,
        ownShareAmount: null,
        incomeMarked: false,
        excluded: false,
        exclusionNote: null,
        classifiedType: "",
        confidence: 0.5,
        reasoning: null,
        overrideType: null,
        classificationStatus: "classified",
        categoryId: null,
        overrideCategoryId: null,
      },
    ]
    render(<TransactionsTable rows={rows} currency="ISK" />)

    // Unclassified → "Needs review"; a real split/none → "Split / none".
    const pending = screen.getByRole("row", { name: /PENDING CO/ })
    expect(
      within(pending).getByRole("button", { name: /needs review/i })
    ).toBeInTheDocument()
    const split = screen.getByRole("row", { name: /SPLIT CO/ })
    expect(
      within(split).getByRole("button", { name: /split \/ none/i })
    ).toBeInTheDocument()
    expect(
      within(split).queryByRole("button", { name: /needs review/i })
    ).not.toBeInTheDocument()
  })

  it("renders an empty state when there are no transactions", () => {
    render(<TransactionsTable rows={[]} currency="ISK" />)
    expect(screen.getByText(/no transactions/i)).toBeInTheDocument()
  })

  it("shows each row's effective Category — override winning, em dash for Uncategorized (ADR-0020)", () => {
    const categories: CategoryOption[] = [
      { id: "cat-food", labelKey: "groceries", label: null }, // seed row → localized
      { id: "cat-pool", labelKey: null, label: "Sundlaug" }, // custom row → literal label
    ]
    const rows: TransactionRow[] = [
      { ...ROWS[0], categoryId: "cat-food", overrideCategoryId: null }, // NETFLIX → Groceries
      { ...ROWS[1], categoryId: "cat-food", overrideCategoryId: "cat-pool" }, // GYM → override wins
      { ...ROWS[2], categoryId: null, overrideCategoryId: null }, // SALARY → Uncategorized
    ]
    render(<TransactionsTable rows={rows} currency="ISK" categories={categories} />)

    expect(screen.getByRole("columnheader", { name: "Category" })).toBeInTheDocument()
    expect(within(screen.getByRole("row", { name: /NETFLIX/ })).getByText("Groceries")).toBeInTheDocument()
    // Override category (custom label) wins over the classified one.
    expect(within(screen.getByRole("row", { name: /GYM/ })).getByText("Sundlaug")).toBeInTheDocument()
    // Uncategorized → em dash.
    expect(within(screen.getByRole("row", { name: /SALARY/ })).getByText("—")).toBeInTheDocument()
  })

  const CATS: CategoryOption[] = [
    { id: "cat-food", labelKey: "groceries", label: null },
    { id: "cat-fuel", labelKey: "fuel", label: null },
  ]
  const catRows: TransactionRow[] = [
    { ...ROWS[0], id: "g", merchant: "BONUS", categoryId: "cat-food", overrideCategoryId: null },
    { ...ROWS[0], id: "f", merchant: "N1", categoryId: "cat-fuel", overrideCategoryId: null },
    { ...ROWS[0], id: "u", merchant: "MYSTERY", categoryId: null, overrideCategoryId: null },
  ]

  it("seeds the category filter from initialCategoryId, reflected in the select (ADR-0020)", async () => {
    render(
      <TransactionsTable rows={catRows} currency="ISK" categories={CATS} initialCategoryId="cat-food" />
    )
    // Only the groceries row is shown; the others are filtered out.
    expect(screen.getByText("BONUS")).toBeInTheDocument()
    expect(screen.queryByText("N1")).not.toBeInTheDocument()
    expect(screen.queryByText("MYSTERY")).not.toBeInTheDocument()
    // The category select reflects the active filter.
    const select = screen.getByRole("combobox", { name: /filter by category/i })
    expect(select).toHaveValue("cat-food")

    // Choosing "All categories" restores the full list.
    await userEvent.selectOptions(select, "all")
    expect(await screen.findByText("N1")).toBeInTheDocument()
    expect(screen.getByText("MYSTERY")).toBeInTheDocument()
  })

  it("lets the user filter by a category from the dropdown", async () => {
    render(<TransactionsTable rows={catRows} currency="ISK" categories={CATS} />)
    // All rows shown initially.
    expect(screen.getByText("BONUS")).toBeInTheDocument()
    expect(screen.getByText("N1")).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /filter by category/i }), "cat-fuel")
    expect(screen.getByText("N1")).toBeInTheDocument()
    expect(screen.queryByText("BONUS")).not.toBeInTheDocument()
    expect(screen.queryByText("MYSTERY")).not.toBeInTheDocument()
  })

  it("filters to Uncategorized rows via the `none` option", async () => {
    render(<TransactionsTable rows={catRows} currency="ISK" categories={CATS} />)
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /filter by category/i }), "none")
    expect(screen.getByText("MYSTERY")).toBeInTheDocument()
    expect(screen.queryByText("BONUS")).not.toBeInTheDocument()
  })

  it("only offers categories present in the shown rows (plus All / Uncategorized)", () => {
    render(<TransactionsTable rows={catRows} currency="ISK" categories={CATS} />)
    const options = within(screen.getByRole("combobox", { name: /filter by category/i }))
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(options).toEqual(["All categories", "Fuel", "Groceries", "Uncategorized"])
  })

  it("ignores an unknown initialCategoryId (no filter applied)", () => {
    render(
      <TransactionsTable rows={catRows} currency="ISK" categories={CATS} initialCategoryId="cat-gone" />
    )
    expect(screen.getByText("BONUS")).toBeInTheDocument()
    expect(screen.getByText("N1")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: /filter by category/i })).toHaveValue("all")
  })

  // Merchants of the data rows, top-to-bottom (the first row is the header).
  const merchantOrder = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1].textContent)

  it("filters by merchant search", async () => {
    render(<TransactionsTable rows={ROWS} currency="ISK" />)
    await userEvent.type(
      screen.getByRole("searchbox", { name: /search transactions/i }),
      "net"
    )
    expect(screen.getByText("NETFLIX")).toBeInTheDocument()
    expect(screen.queryByText("GYM")).not.toBeInTheDocument()
    expect(screen.getByText(/1 of 3 transactions/i)).toBeInTheDocument()
  })

  it("filters by type bucket (credits vs expense types)", async () => {
    render(<TransactionsTable rows={ROWS} currency="ISK" />)
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /filter by type/i }),
      "Credits"
    )
    expect(screen.getByText("SALARY")).toBeInTheDocument()
    expect(screen.queryByText("NETFLIX")).not.toBeInTheDocument()
    expect(screen.queryByText("GYM")).not.toBeInTheDocument()
  })

  it("sorts by amount when its header is clicked (largest first)", async () => {
    render(<TransactionsTable rows={ROWS} currency="ISK" />)
    // Default order is date-descending.
    expect(merchantOrder()).toEqual(["NETFLIX", "GYM", "SALARY"])
    await userEvent.click(screen.getByRole("button", { name: /amount/i }))
    expect(merchantOrder()).toEqual(["SALARY", "NETFLIX", "GYM"])
    // A second click flips the direction.
    await userEvent.click(screen.getByRole("button", { name: /amount/i }))
    expect(merchantOrder()).toEqual(["GYM", "NETFLIX", "SALARY"])
  })

  it("shows a no-match state that clears the active filters", async () => {
    render(<TransactionsTable rows={ROWS} currency="ISK" />)
    await userEvent.type(
      screen.getByRole("searchbox", { name: /search transactions/i }),
      "zzz"
    )
    expect(screen.getByText(/no matching transactions/i)).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: /clear filters/i })
    )
    expect(screen.getByText("NETFLIX")).toBeInTheDocument()
    expect(screen.getByText("SALARY")).toBeInTheDocument()
  })
})

describe("TransactionsTable — shared expenses (ADR-0014)", () => {
  const lastBody = (fetchMock: ReturnType<typeof vi.fn>) =>
    JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string)

  it("sets an Own share via the Split editor", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    render(<TransactionsTable rows={ROWS} currency="ISK" />)

    await openRowMenu(user, /NETFLIX/)
    await user.click(
      await screen.findByRole("menuitem", { name: /split charge/i })
    )

    const row = screen.getByRole("row", { name: /NETFLIX/ })
    await user.type(within(row).getByLabelText(/your share/i), "500")
    await user.click(within(row).getByRole("button", { name: /^save$/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions/t1/share",
      expect.objectContaining({ method: "PUT" })
    )
    expect(lastBody(fetchMock)).toEqual({ ownShareAmount: -500 })
    // After saving, the row is tagged Shared and the amount cell gains a "your share" sub-line.
    expect(await within(row).findByText(/^shared$/i)).toBeInTheDocument()
    expect(within(row).getByText(/your share/i)).toBeInTheDocument()
  })

  it("fills the share from an even split by headcount", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    )
    const user = userEvent.setup()
    render(<TransactionsTable rows={ROWS} currency="ISK" />)

    // NETFLIX is -1990; split 2 ways → 995.
    await openRowMenu(user, /NETFLIX/)
    await user.click(
      await screen.findByRole("menuitem", { name: /split charge/i })
    )

    const row = screen.getByRole("row", { name: /NETFLIX/ })
    await user.type(within(row).getByLabelText(/split evenly/i), "2")
    expect(
      within(row).getByLabelText<HTMLInputElement>(/your share/i).value
    ).toBe("995")
  })

  it("shows a shared row's tag and share, and removes the split", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    const shared: TransactionRow = {
      ...ROWS[0],
      id: "t9",
      merchant: "GROUP GIFT",
      amount: -200_000,
      ownShareAmount: -28_571,
    }
    render(<TransactionsTable rows={[shared]} currency="ISK" />)

    const row = screen.getByRole("row", { name: /GROUP GIFT/ })
    expect(within(row).getByText(/^shared$/i)).toBeInTheDocument()
    // The full charge shows, plus a "your share" annotation in the amount cell.
    expect(within(row).getByText(/your share/i)).toBeInTheDocument()

    await openRowMenu(user, /GROUP GIFT/)
    await user.click(
      await screen.findByRole("menuitem", { name: /remove split/i })
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions/t9/share",
      expect.objectContaining({ method: "DELETE" })
    )
  })
})
