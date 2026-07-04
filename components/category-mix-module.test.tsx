import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CategoryMixModule } from "@/components/category-mix-module"
import { renderWithIntl as render } from "@/lib/test/render"
import type { CategoryTrendPoint } from "@/lib/dashboard/category-trend"
import type { MonthlySpendPoint } from "@/lib/dashboard/monthly-series"

function cat(
  month: string,
  byType: Partial<CategoryTrendPoint["byExpenseType"]>,
  unclassified = 0
): CategoryTrendPoint {
  return {
    month,
    byExpenseType: {
      Fixed: 0,
      Necessary: 0,
      "Nice to have": 0,
      "": 0,
      ...byType,
    },
    unclassified,
  }
}

const TREND: CategoryTrendPoint[] = [
  cat("2026-02", { Fixed: 100000, Necessary: 50000 }),
  cat("2026-03", { Fixed: 60000, "Nice to have": 40000 }), // current
]

// Spend series whose totals equal each month's card debits, so no off-card fixed is folded in — the
// baseline for tests that assert the card-only mix. (One test overrides this to exercise folding.)
const SERIES: MonthlySpendPoint[] = [
  { month: "2026-02", spending: 150000, income: 0, difference: -150000 },
  { month: "2026-03", spending: 100000, income: 0, difference: -100000 },
]

describe("CategoryMixModule", () => {
  it("shows the current-period breakdown (reusing SpendingByType) and the mix-over-time labels", () => {
    render(
      <CategoryMixModule
        categoryTrend={TREND}
        series={SERIES}
        currentMonth="2026-03"
        mostlyUnclassified={false}
        currency="ISK"
      />
    )
    expect(screen.getByText(/Where it goes/i)).toBeInTheDocument()
    // Current cycle (2026-03) breakdown via SpendingByType (also echoed in the mix legend).
    expect(screen.getAllByText("Fixed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Nice to have").length).toBeGreaterThan(0)
    // Mix-over-time strip exposes each month via an accessible summary.
    expect(screen.getByText(/February 2026 spending mix/i)).toBeInTheDocument()
    expect(screen.getByText(/March 2026 spending mix/i)).toBeInTheDocument()
  })

  it("names every category that appears (and only those) in the mix summary", () => {
    render(
      <CategoryMixModule
        categoryTrend={TREND}
        series={SERIES}
        currentMonth="2026-03"
        mostlyUnclassified={false}
        currency="ISK"
      />
    )
    // TREND spans Fixed, Necessary and Nice to have across its two months; each is named in the
    // sr-only per-month summary. (The visual key is a Recharts <ChartLegend>, which only renders
    // in a laid-out browser, not jsdom.)
    expect(screen.getAllByText(/Fixed \d+%/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Necessary \d+%/)).toBeInTheDocument()
    expect(screen.getByText(/Nice to have \d+%/)).toBeInTheDocument()
    // Buckets absent from every month never appear.
    expect(screen.queryByText(/Unclassified/)).not.toBeInTheDocument()
  })

  it("exposes each month's mix to assistive tech via a screen-reader summary", () => {
    render(
      <CategoryMixModule
        categoryTrend={TREND}
        series={SERIES}
        currentMonth="2026-03"
        mostlyUnclassified={false}
        currency="ISK"
      />
    )
    // 2026-03: Fixed 60000 + Nice to have 40000 -> Fixed 60%, Nice to have 40%.
    expect(
      screen.getByText(/March 2026 spending mix: Fixed 60%, Nice to have 40%/i)
    ).toBeInTheDocument()
  })

  it("shows a classify-to-unlock nudge when spending is mostly unclassified", () => {
    render(
      <CategoryMixModule
        categoryTrend={TREND}
        series={SERIES}
        currentMonth="2026-03"
        mostlyUnclassified
        currency="ISK"
      />
    )
    const link = screen.getByRole("link", { name: /classify transactions/i })
    expect(link).toHaveAttribute("href", "/transactions")
  })

  it("omits the nudge when enough is classified", () => {
    render(
      <CategoryMixModule
        categoryTrend={TREND}
        series={SERIES}
        currentMonth="2026-03"
        mostlyUnclassified={false}
        currency="ISK"
      />
    )
    expect(
      screen.queryByRole("link", { name: /classify transactions/i })
    ).not.toBeInTheDocument()
  })

  it("folds each cycle's configured off-card fixed costs into Fixed from the spend series", () => {
    render(
      <CategoryMixModule
        categoryTrend={TREND}
        // 2026-03 total 150000 vs 100000 card debits -> 50000 off-card fixed folds into Fixed.
        series={[
          { month: "2026-02", spending: 150000, income: 0, difference: -150000 },
          { month: "2026-03", spending: 150000, income: 20000, difference: -130000 },
        ]}
        currentMonth="2026-03"
        mostlyUnclassified={false}
        currency="ISK"
      />
    )
    // Current-cycle Fixed = 60000 card + 50000 off-card = 110000 in the SpendingByType legend.
    expect(screen.getByText(/110,000/)).toBeInTheDocument()
  })
})
