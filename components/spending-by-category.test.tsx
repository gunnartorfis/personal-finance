import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SpendingByCategory, type CategoryChartLeaf } from "@/components/spending-by-category"
import type { CategoryBreakdown } from "@/lib/dashboard/category-breakdown"
import { renderWithIntl as render } from "@/lib/test/render"

const leaves: CategoryChartLeaf[] = [
  { id: "cat-groceries", labelKey: "groceries", label: null },
  { id: "cat-fuel", labelKey: "fuel", label: null },
  { id: "cat-custom", labelKey: null, label: "Sundlaug" },
]

const breakdown = (partial: Partial<CategoryBreakdown>): CategoryBreakdown => ({
  expense: 0,
  byCategory: {},
  uncategorized: 0,
  ...partial,
})

describe("SpendingByCategory (ADR-0020, S5b)", () => {
  it("renders the heading, total, and a legend row per present category", () => {
    render(
      <SpendingByCategory
        breakdown={breakdown({
          expense: -10000,
          byCategory: { "cat-groceries": -6000, "cat-fuel": -4000 },
        })}
        categories={leaves}
        currency="ISK"
      />
    )
    expect(screen.getByRole("heading", { name: "Spending by category" })).toBeInTheDocument()
    // Seed rows localize via their labelKey (categories catalog).
    expect(screen.getByText("Groceries")).toBeInTheDocument()
    expect(screen.getByText("Fuel")).toBeInTheDocument()
  })

  it("labels a custom category by its literal label (not translated)", () => {
    render(
      <SpendingByCategory
        breakdown={breakdown({ expense: -5000, byCategory: { "cat-custom": -5000 } })}
        categories={leaves}
        currency="ISK"
      />
    )
    expect(screen.getByText("Sundlaug")).toBeInTheDocument()
  })

  it("shows an Uncategorized row when there is uncategorized spend", () => {
    render(
      <SpendingByCategory
        breakdown={breakdown({ expense: -5000, byCategory: { "cat-fuel": -3000 }, uncategorized: -2000 })}
        categories={leaves}
        currency="ISK"
      />
    )
    expect(screen.getByText("Uncategorized")).toBeInTheDocument()
  })

  it("renders nothing when there is no spend", () => {
    const { container } = render(
      <SpendingByCategory breakdown={breakdown({})} categories={leaves} currency="ISK" />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
