import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { NetSummaryCard } from "@/components/net-summary-card"
import type { NetSummary } from "@/lib/dashboard/net-summary"

const summary: NetSummary = {
  income: 1000,
  expense: -600,
  net: 400,
  byExpenseType: { Fixed: -300, Necessary: -200, "Nice to have": -100, "": 0 },
  unclassified: 0,
}

describe("NetSummaryCard", () => {
  it("shows the cycle label, a net profit when net >= 0, and the income/expense totals", () => {
    render(<NetSummaryCard summary={summary} currency="ISK" cycleLabel="March 2026" />)
    expect(screen.getByText("March 2026")).toBeInTheDocument()
    expect(screen.getByText("Net profit")).toBeInTheDocument()
    expect(screen.getByText("Income")).toBeInTheDocument()
    expect(screen.getByText("Expenses")).toBeInTheDocument()
    expect(screen.getByText(/1,000/)).toBeInTheDocument()
    // Expenses render as a positive magnitude (not "-600"), matching the breakdown rows.
    expect(screen.getByText(/^[^-]*600$/)).toBeInTheDocument()
  })

  it("labels a negative net as a loss", () => {
    render(<NetSummaryCard summary={{ ...summary, net: -50 }} currency="ISK" cycleLabel="March 2026" />)
    expect(screen.getByText("Net loss")).toBeInTheDocument()
  })

  it("lists the three main expense-type buckets", () => {
    render(<NetSummaryCard summary={summary} currency="ISK" cycleLabel="March 2026" />)
    expect(screen.getByText("Fixed")).toBeInTheDocument()
    expect(screen.getByText("Necessary")).toBeInTheDocument()
    expect(screen.getByText("Nice to have")).toBeInTheDocument()
  })

  it("shows the Other row only when the not-bucketed total is nonzero", () => {
    const { rerender } = render(
      <NetSummaryCard summary={summary} currency="ISK" cycleLabel="March 2026" />,
    )
    expect(screen.queryByText("Other")).not.toBeInTheDocument()

    rerender(
      <NetSummaryCard
        summary={{ ...summary, byExpenseType: { ...summary.byExpenseType, "": -25 } }}
        currency="ISK"
        cycleLabel="March 2026"
      />,
    )
    expect(screen.getByText("Other")).toBeInTheDocument()
  })

  it("shows the unclassified row only when it is nonzero", () => {
    const { rerender } = render(
      <NetSummaryCard summary={summary} currency="ISK" cycleLabel="March 2026" />,
    )
    expect(screen.queryByText("Unclassified")).not.toBeInTheDocument()

    rerender(
      <NetSummaryCard
        summary={{ ...summary, unclassified: -40 }}
        currency="ISK"
        cycleLabel="March 2026"
      />,
    )
    expect(screen.getByText("Unclassified")).toBeInTheDocument()
  })
})
