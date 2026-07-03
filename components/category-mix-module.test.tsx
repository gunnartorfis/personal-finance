import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CategoryMixModule } from "@/components/category-mix-module"
import type { CategoryTrendPoint } from "@/lib/dashboard/category-trend"

function cat(
  month: string,
  byType: Partial<CategoryTrendPoint["byExpenseType"]>,
  unclassified = 0,
): CategoryTrendPoint {
  return {
    month,
    byExpenseType: { Fixed: 0, Necessary: 0, "Nice to have": 0, "": 0, ...byType },
    unclassified,
  }
}

const TREND: CategoryTrendPoint[] = [
  cat("2026-02", { Fixed: 100000, Necessary: 50000 }),
  cat("2026-03", { Fixed: 60000, "Nice to have": 40000 }), // current
]

describe("CategoryMixModule", () => {
  it("shows the current-period breakdown (reusing SpendingByType) and the mix-over-time labels", () => {
    render(
      <CategoryMixModule
        categoryTrend={TREND}
        currentMonth="2026-03"
        mostlyUnclassified={false}
        currency="ISK"
      />,
    )
    expect(screen.getByText(/Where it goes/i)).toBeInTheDocument()
    // Current cycle (2026-03) breakdown via SpendingByType (also echoed in the mix legend).
    expect(screen.getAllByText("Fixed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Nice to have").length).toBeGreaterThan(0)
    // Mix-over-time strip exposes each month via an accessible summary.
    expect(screen.getByText(/February 2026 spending mix/i)).toBeInTheDocument()
    expect(screen.getByText(/March 2026 spending mix/i)).toBeInTheDocument()
  })

  it("labels the mix-over-time colours with a legend of only the categories that appear", () => {
    render(
      <CategoryMixModule
        categoryTrend={TREND}
        currentMonth="2026-03"
        mostlyUnclassified={false}
        currency="ISK"
      />,
    )
    // TREND spans Fixed, Necessary and Nice to have across its two months.
    expect(screen.getAllByText("Fixed").length).toBeGreaterThan(0)
    expect(screen.getByText("Necessary")).toBeInTheDocument()
    expect(screen.getAllByText("Nice to have").length).toBeGreaterThan(0)
    // Buckets absent from every month never appear in the legend.
    expect(screen.queryByText("Unclassified")).not.toBeInTheDocument()
  })

  it("exposes each month's mix to assistive tech via a screen-reader summary", () => {
    render(
      <CategoryMixModule
        categoryTrend={TREND}
        currentMonth="2026-03"
        mostlyUnclassified={false}
        currency="ISK"
      />,
    )
    // 2026-03: Fixed 60000 + Nice to have 40000 -> Fixed 60%, Nice to have 40%.
    expect(
      screen.getByText(/March 2026 spending mix: Fixed 60%, Nice to have 40%/i),
    ).toBeInTheDocument()
  })

  it("shows a classify-to-unlock nudge when spending is mostly unclassified", () => {
    render(
      <CategoryMixModule
        categoryTrend={TREND}
        currentMonth="2026-03"
        mostlyUnclassified
        currency="ISK"
      />,
    )
    const link = screen.getByRole("link", { name: /classify transactions/i })
    expect(link).toHaveAttribute("href", "/transactions")
  })

  it("omits the nudge when enough is classified", () => {
    render(
      <CategoryMixModule
        categoryTrend={TREND}
        currentMonth="2026-03"
        mostlyUnclassified={false}
        currency="ISK"
      />,
    )
    expect(screen.queryByRole("link", { name: /classify transactions/i })).not.toBeInTheDocument()
  })
})
