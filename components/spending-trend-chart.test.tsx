import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SpendingTrendChart, incomeLineBottom } from "@/components/spending-trend-chart"
import type { MonthlySpendPoint } from "@/lib/dashboard/monthly-series"
import { renderWithIntl as render } from "@/lib/test/render"

const SERIES: MonthlySpendPoint[] = [
  { month: "2026-01", spending: 300000, income: 0, difference: -300000 },
  { month: "2026-02", spending: 350000, income: 50000, difference: -300000 },
  { month: "2026-03", spending: 100000, income: 20000, difference: -80000 },
]

describe("SpendingTrendChart", () => {
  it("shows a keep-uploading placeholder (no bars) until there's enough history", () => {
    render(
      <SpendingTrendChart series={SERIES} hasEnoughHistory={false} completedMonths={1} currency="ISK" locale="en" />,
    )
    expect(screen.getByText(/1\/3 months/i)).toBeInTheDocument()
    expect(screen.queryAllByRole("link")).toHaveLength(0)
  })

  it("renders one tappable bar per month linking to that cycle, with an accessible label", () => {
    render(
      <SpendingTrendChart series={SERIES} hasEnoughHistory completedMonths={3} currency="ISK" locale="en" />,
    )
    const links = screen.getAllByRole("link")
    expect(links).toHaveLength(3)
    const march = screen.getByRole("link", { name: /March 2026/i })
    expect(march).toHaveAttribute("href", "/transactions?cycle=2026-03")
    expect(march).toHaveAccessibleName(/100,000/)
  })

  it("clamps the income line so a 100% (ceiling) value isn't clipped by overflow-hidden", () => {
    // A bare "100%" would push the 2px line entirely above the track's top edge.
    expect(incomeLineBottom(100)).toBe("min(100%, calc(100% - 2px))")
    expect(incomeLineBottom(40)).toBe("min(40%, calc(100% - 2px))")
  })

  it("shows a legend for spending and income", () => {
    render(
      <SpendingTrendChart series={SERIES} hasEnoughHistory completedMonths={3} currency="ISK" locale="en" />,
    )
    expect(screen.getByText("Spending")).toBeInTheDocument()
    expect(screen.getByText("Income")).toBeInTheDocument()
  })
})
