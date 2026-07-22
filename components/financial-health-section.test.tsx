import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FinancialHealthSection } from "@/components/financial-health-section"
import type { FinancialHealth } from "@/lib/dashboard/financial-health"
import type { NetWorth } from "@/lib/dashboard/net-worth"
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

const NET_WORTH: NetWorth = { total: 1_000_000, accountCount: 2, asOf: new Date("2026-03-01Z") }

function renderSection(
  props: Partial<React.ComponentProps<typeof FinancialHealthSection>> = {},
  opts?: { locale?: "en" | "is" }
) {
  return render(
    <FinancialHealthSection
      health={props.health ?? HEALTH}
      // `in` (not ??) so an explicit `netWorth: null` isn't overridden by the default.
      netWorth={"netWorth" in props ? (props.netWorth ?? null) : NET_WORTH}
      currency={props.currency ?? "ISK"}
    />,
    opts
  )
}

describe("FinancialHealthSection — profit & savings", () => {
  it("shows the savings rate as a percent, typical saving, and profit streak", () => {
    renderSection()
    expect(screen.getByText("Financial health")).toBeInTheDocument()
    expect(screen.getByText("Savings rate")).toBeInTheDocument()
    expect(screen.getByText("20%")).toBeInTheDocument()
    expect(screen.getByText(/Typical monthly saving/i)).toBeInTheDocument()
    expect(screen.getByText("5 of 6")).toBeInTheDocument()
    expect(screen.getByText(/healthy target/i)).toBeInTheDocument()
  })

  it("renders a negative savings rate with a minus sign", () => {
    renderSection({ health: { ...HEALTH, savingsRate: -0.1, avgMonthlySaving: -25000 } })
    expect(screen.getByText("-10%")).toBeInTheDocument()
  })

  it("falls back to a dash and hides the benchmark when the rate can't be computed", () => {
    renderSection({ health: { ...HEALTH, savingsRate: null } })
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.getByText("5 of 6")).toBeInTheDocument()
    expect(screen.queryByText(/healthy target/i)).not.toBeInTheDocument()
  })

  it("shows a neutral thin-data line instead of profit stats without enough history", () => {
    renderSection({
      health: {
        completedCycles: 1,
        hasEnoughHistory: false,
        avgMonthlySaving: null,
        avgMonthlyIncome: null,
        savingsRate: null,
        monthlyBurn: null,
        profitableCount: 1,
        streakConsidered: 1,
      },
    })
    expect(screen.getByText(/A few months of history/i)).toBeInTheDocument()
    expect(screen.queryByText("Savings rate")).not.toBeInTheDocument()
  })
})

describe("FinancialHealthSection — runway", () => {
  it("shows runway (net worth ÷ burn, floored)", () => {
    renderSection() // 1,000,000 / 200,000 = 5 months
    expect(screen.getByText("Runway")).toBeInTheDocument()
    expect(screen.getByText("5 months")).toBeInTheDocument()
    expect(screen.getByText(/if income stopped/i)).toBeInTheDocument()
  })

  it("hides runway when burn is unknown", () => {
    renderSection({ health: { ...HEALTH, monthlyBurn: null } })
    expect(screen.queryByText("Runway")).not.toBeInTheDocument()
    // The profit half still renders.
    expect(screen.getByText("Savings rate")).toBeInTheDocument()
  })

  it("hides runway when there is no net worth", () => {
    renderSection({ netWorth: null })
    expect(screen.queryByText("Runway")).not.toBeInTheDocument()
    expect(screen.getByText("Savings rate")).toBeInTheDocument()
  })

  it("localizes the section for the is catalog", () => {
    renderSection({}, { locale: "is" })
    expect(screen.getByText("Fjárhagsheilsa")).toBeInTheDocument()
    expect(screen.getByText("Ending")).toBeInTheDocument() // runway (is)
  })
})
