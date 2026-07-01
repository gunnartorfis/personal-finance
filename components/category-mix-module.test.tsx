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
    // Current cycle (2026-03) breakdown via SpendingByType.
    expect(screen.getByText("Fixed")).toBeInTheDocument()
    expect(screen.getByText("Nice to have")).toBeInTheDocument()
    // Mix-over-time strip has a label per month.
    expect(screen.getByText("Feb")).toBeInTheDocument()
    expect(screen.getByText("Mar")).toBeInTheDocument()
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
