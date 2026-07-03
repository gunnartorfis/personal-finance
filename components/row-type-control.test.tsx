import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RowTypeControl } from "@/components/row-type-control"
import type { TransactionRow } from "@/components/transactions-table"

afterEach(() => vi.unstubAllGlobals())

const fmt = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ISK",
    maximumFractionDigits: 0,
  }).format(amount)

const BASE: TransactionRow = {
  id: "t1",
  date: "2026-03-15",
  merchant: "VÍS",
  amount: -5000,
  ownShareAmount: null,
  incomeMarked: false,
  excluded: false,
  exclusionNote: null,
  classifiedType: "Necessary",
  confidence: 0.8,
  reasoning: null,
  overrideType: null,
  classificationStatus: "classified",
}

function setup(row: Partial<TransactionRow> = {}) {
  const handlers = {
    onOverrideChanged: vi.fn(),
    onIncomeChanged: vi.fn(),
    onExcludeChanged: vi.fn(),
    onShareChanged: vi.fn(),
  }
  render(<RowTypeControl row={{ ...BASE, ...row }} formatAmount={fmt} {...handlers} />)
  return { user: userEvent.setup(), ...handlers }
}

describe("RowTypeControl", () => {
  it("resets an overridden row back to the AI suggestion", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    const { user, onOverrideChanged } = setup({ overrideType: "Fixed" })

    await user.click(screen.getByRole("button", { name: /fixed/i }))
    await user.click(
      await screen.findByRole("menuitem", { name: /reset to ai/i })
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions/t1/override",
      expect.objectContaining({ method: "DELETE" })
    )
    expect(onOverrideChanged).toHaveBeenCalledWith({
      expenseType: null,
      hasOverride: false,
    })
  })

  it("creates a whole-merchant rule from the current type (ADR-0012)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    const { user } = setup()

    await user.click(screen.getByRole("button", { name: /necessary/i }))
    await user.click(
      await screen.findByRole("menuitem", { name: /apply to all VÍS/i })
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/merchant-rules",
      expect.objectContaining({ method: "POST" })
    )
    // The item stays put and reports success in place.
    expect(
      await screen.findByRole("menuitem", { name: /rule added for VÍS/i })
    ).toBeInTheDocument()
  })

  it("reports when a merchant rule already exists (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) }))
    )
    const { user } = setup()

    await user.click(screen.getByRole("button", { name: /necessary/i }))
    await user.click(
      await screen.findByRole("menuitem", { name: /apply to all VÍS/i })
    )
    expect(
      await screen.findByRole("menuitem", { name: /already exists/i })
    ).toBeInTheDocument()
  })

  it("does not offer a rule for the split / none type", async () => {
    const { user } = setup({ classifiedType: "", overrideType: "" })
    await user.click(screen.getByRole("button", { name: /split \/ none/i }))
    expect(
      screen.queryByRole("menuitem", { name: /apply to all/i })
    ).not.toBeInTheDocument()
  })

  it("excludes a debit with an optional reason (ADR-0011)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    const { user, onExcludeChanged } = setup()

    await user.click(screen.getByRole("button", { name: /necessary/i }))
    await user.click(await screen.findByRole("menuitem", { name: /exclude/i }))

    await user.type(screen.getByLabelText(/reason for excluding/i), "duplicate")
    await user.click(screen.getByRole("button", { name: /^exclude$/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions/t1/exclude",
      expect.objectContaining({ method: "PUT" })
    )
    expect(onExcludeChanged).toHaveBeenCalledWith({
      excluded: true,
      note: "duplicate",
    })
  })

  it("offers Edit / Remove split on an already-shared row", async () => {
    const { user } = setup({ ownShareAmount: -2000 })
    expect(screen.getByText(/^shared$/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /necessary/i }))
    expect(
      await screen.findByRole("menuitem", { name: /edit split/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("menuitem", { name: /remove split/i })
    ).toBeInTheDocument()
  })

  it("unmarks a credit already counted as income", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    const { user, onIncomeChanged } = setup({
      amount: 90000,
      classifiedType: "",
      incomeMarked: true,
    })

    await user.click(screen.getByRole("button", { name: /^income$/i }))
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: /count as income/i })
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions/t1/income",
      expect.objectContaining({ method: "DELETE" })
    )
    expect(onIncomeChanged).toHaveBeenCalledWith(false)
  })
})
