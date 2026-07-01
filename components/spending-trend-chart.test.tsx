import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SpendingTrendChart } from "@/components/spending-trend-chart"
import type { MonthlySpendPoint } from "@/lib/dashboard/monthly-series"

const SERIES: MonthlySpendPoint[] = [
  { month: "2026-01", spending: 300000, moneyIn: 0, difference: -300000 },
  { month: "2026-02", spending: 350000, moneyIn: 50000, difference: -300000 },
  { month: "2026-03", spending: 100000, moneyIn: 20000, difference: -80000 },
]

describe("SpendingTrendChart", () => {
  it("shows a keep-uploading placeholder (no bars) until there's enough history", () => {
    render(
      <SpendingTrendChart series={SERIES} hasEnoughHistory={false} completedMonths={1} currency="ISK" />,
    )
    expect(screen.getByText(/1\/3 months/i)).toBeInTheDocument()
    expect(screen.queryAllByRole("link")).toHaveLength(0)
  })

  it("renders one tappable bar per month linking to that cycle, with an accessible label", () => {
    render(
      <SpendingTrendChart series={SERIES} hasEnoughHistory completedMonths={3} currency="ISK" />,
    )
    const links = screen.getAllByRole("link")
    expect(links).toHaveLength(3)
    const march = screen.getByRole("link", { name: /March 2026/i })
    expect(march).toHaveAttribute("href", "/transactions?cycle=2026-03")
    expect(march).toHaveAccessibleName(/100,000/)
  })

  it("shows a legend for spending and money in", () => {
    render(
      <SpendingTrendChart series={SERIES} hasEnoughHistory completedMonths={3} currency="ISK" />,
    )
    expect(screen.getByText("Spending")).toBeInTheDocument()
    expect(screen.getByText("Money in")).toBeInTheDocument()
  })
})
