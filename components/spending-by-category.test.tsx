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
        periodMonths={3}
      />
    )
    expect(screen.getByRole("heading", { name: /Spending by category · last 3 months/ })).toBeInTheDocument()
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
        periodMonths={3}
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
        periodMonths={3}
      />
    )
    expect(screen.getByText("Uncategorized")).toBeInTheDocument()
  })

  it("collapses categories beyond the palette into an 'Other' row", () => {
    // Six named categories exceed the 5-colour palette, so the 6th folds into "Other ({count})".
    const many: CategoryChartLeaf[] = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      labelKey: null,
      label: `Cat ${i}`,
    }))
    render(
      <SpendingByCategory
        breakdown={breakdown({
          expense: -6000,
          byCategory: { c0: -1500, c1: -1200, c2: -1000, c3: -900, c4: -800, c5: -600 },
        })}
        categories={many}
        currency="ISK"
        periodMonths={3}
      />
    )
    // One category past the palette → "Other (1)".
    expect(screen.getByText("Other (1)")).toBeInTheDocument()
    // The smallest (c5) is the one folded away, so it never appears on its own.
    expect(screen.queryByText("Cat 5")).not.toBeInTheDocument()
  })

  it("renders nothing when there is no spend", () => {
    const { container } = render(
      <SpendingByCategory breakdown={breakdown({})} categories={leaves} currency="ISK" periodMonths={3} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
