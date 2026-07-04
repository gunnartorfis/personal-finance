import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { BudgetEnvelopes } from "@/components/budget-envelopes"
import type { BudgetStatus } from "@/lib/dashboard/budget-status"
import { renderWithIntl as render } from "@/lib/test/render"

const STATUS: BudgetStatus = {
  envelopes: [
    { type: "Fixed", budget: 200_000, spent: 120_000, remaining: 80_000, ratio: 0.6, level: "ok" },
    { type: "Necessary", budget: 100_000, spent: 90_000, remaining: 10_000, ratio: 0.9, level: "warning" },
    { type: "Nice to have", budget: 30_000, spent: 42_000, remaining: -12_000, ratio: 1.4, level: "over" },
  ],
  totalBudget: 330_000,
  totalSpent: 252_000,
  totalRemaining: 78_000,
}

describe("BudgetEnvelopes", () => {
  it("renders nothing when there are no envelopes", () => {
    const { container } = render(
      <BudgetEnvelopes
        status={{ envelopes: [], totalBudget: 0, totalSpent: 0, totalRemaining: 0 }}
        currency="ISK"
        locale="en"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("lists each envelope with its category, remaining, and over amounts", () => {
    render(<BudgetEnvelopes status={STATUS} currency="ISK" locale="en" />)
    expect(screen.getByText("Budgets")).toBeInTheDocument()
    expect(screen.getByText("Fixed")).toBeInTheDocument()
    expect(screen.getByText("Nice to have")).toBeInTheDocument()
    expect(screen.getByText(/80[.,]000 left/)).toBeInTheDocument()
    expect(screen.getByText(/12[.,]000 over/)).toBeInTheDocument()
  })

  it("shows a warning-level envelope with a remaining amount, not styled as over", () => {
    render(<BudgetEnvelopes status={STATUS} currency="ISK" locale="en" />)
    const warning = screen.getByText(/10[.,]000 left/)
    expect(warning).toBeInTheDocument()
    expect(warning.className).not.toContain("text-destructive")
  })
})
