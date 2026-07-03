import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FinancialHealthSection } from "@/components/financial-health-section"
import type { FinancialHealth } from "@/lib/dashboard/financial-health"
import { renderWithIntl as render } from "@/lib/test/render"

const HEALTH: FinancialHealth = {
  completedCycles: 6,
  hasEnoughHistory: true,
  avgMonthlySaving: 50000,
  avgMonthlyIncome: 250000,
  savingsRate: 0.2,
  monthlyBurn: 200000,
  profitableCount: 5,
  streakConsidered: 6,
}

describe("FinancialHealthSection", () => {
  it("shows the savings rate as a percent, typical saving, and profit streak", () => {
    render(<FinancialHealthSection health={HEALTH} currency="ISK" />)
    expect(screen.getByText("Financial health")).toBeInTheDocument()
    expect(screen.getByText("Savings rate")).toBeInTheDocument()
    expect(screen.getByText("20%")).toBeInTheDocument()
    expect(screen.getByText(/Typical monthly saving/i)).toBeInTheDocument()
    expect(screen.getByText(/50,000/)).toBeInTheDocument()
    expect(screen.getByText("5 of 6")).toBeInTheDocument()
    expect(screen.getByText(/healthy target/i)).toBeInTheDocument()
  })

  it("renders a negative savings rate with a minus sign", () => {
    render(
      <FinancialHealthSection
        health={{ ...HEALTH, savingsRate: -0.1, avgMonthlySaving: -25000 }}
        currency="ISK"
      />
    )
    expect(screen.getByText("-10%")).toBeInTheDocument()
  })

  it("falls back to a dash for the savings rate when it can't be computed (zero income)", () => {
    render(<FinancialHealthSection health={{ ...HEALTH, savingsRate: null }} currency="ISK" />)
    expect(screen.getByText("—")).toBeInTheDocument()
    // The other stats still render.
    expect(screen.getByText("5 of 6")).toBeInTheDocument()
    // With no rate to benchmark, the 20%-target line is suppressed.
    expect(screen.queryByText(/healthy target/i)).not.toBeInTheDocument()
  })

  it("shows a neutral thin-data line instead of stats without enough history", () => {
    render(
      <FinancialHealthSection
        health={{
          completedCycles: 1,
          hasEnoughHistory: false,
          avgMonthlySaving: null,
          avgMonthlyIncome: null,
          savingsRate: null,
          monthlyBurn: null,
          profitableCount: 1,
          streakConsidered: 1,
        }}
        currency="ISK"
      />
    )
    expect(screen.getByText(/A few months of history/i)).toBeInTheDocument()
    expect(screen.queryByText("Savings rate")).not.toBeInTheDocument()
  })

  it("localizes the section for the is catalog", () => {
    render(<FinancialHealthSection health={HEALTH} currency="ISK" />, { locale: "is" })
    expect(screen.getByText("Fjárhagsheilsa")).toBeInTheDocument()
    expect(screen.getByText("Sparnaðarhlutfall")).toBeInTheDocument()
  })
})
