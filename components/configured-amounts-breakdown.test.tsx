import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ConfiguredAmountsBreakdown } from "@/components/configured-amounts-breakdown"
import type { ConfiguredCycleItems } from "@/lib/dashboard/configured-amounts"
import { renderWithIntl as render } from "@/lib/test/render"

const items: ConfiguredCycleItems = {
  incomeSourcesTotal: 520_000,
  offCardCosts: [
    { name: "Húsaleiga", amount: 200_000 },
    { name: "Bílalán", amount: 50_000 },
  ],
  oneOffCosts: [
    { label: "Tryggingar", amount: 12_000 },
    { label: null, amount: 5_000 },
  ],
  oneOffIncomes: [{ label: "Bónus", amount: 30_000 }],
}

describe("ConfiguredAmountsBreakdown", () => {
  it("itemizes off-card cost sources under their heading", () => {
    render(
      <ConfiguredAmountsBreakdown
        items={items}
        showIncomeSources
        currency="ISK"
      />
    )
    expect(screen.getByText("Off-card costs")).toBeInTheDocument()
    expect(screen.getByText("Húsaleiga")).toBeInTheDocument()
    expect(screen.getByText("Bílalán")).toBeInTheDocument()
  })

  it("itemizes one-offs with their label, falling back when a label is blank", () => {
    render(
      <ConfiguredAmountsBreakdown
        items={items}
        showIncomeSources
        currency="ISK"
      />
    )
    expect(screen.getByText("One-off adjustments")).toBeInTheDocument()
    expect(screen.getByText("Tryggingar")).toBeInTheDocument()
    expect(screen.getByText("Bónus")).toBeInTheDocument()
    // The null-label one-off falls back to a generic label.
    expect(screen.getByText("One-off")).toBeInTheDocument()
  })

  it("shows the income-sources line only when asked (i.e. it differs from Tekjur)", () => {
    const { rerender } = render(
      <ConfiguredAmountsBreakdown
        items={items}
        showIncomeSources
        currency="ISK"
      />
    )
    expect(screen.getByText("Income sources")).toBeInTheDocument()
    expect(screen.getByText(/520,000/)).toBeInTheDocument()

    rerender(
      <ConfiguredAmountsBreakdown
        items={items}
        showIncomeSources={false}
        currency="ISK"
      />
    )
    expect(screen.queryByText("Income sources")).not.toBeInTheDocument()
  })

  it("shows costs as negative magnitudes and income as positive", () => {
    render(
      <ConfiguredAmountsBreakdown
        items={items}
        showIncomeSources
        currency="ISK"
      />
    )
    expect(screen.getByText(/-.*200,000/)).toBeInTheDocument()
    expect(screen.getByText(/^[^-]*30,000/)).toBeInTheDocument()
  })

  it("links to the income & costs settings", () => {
    render(
      <ConfiguredAmountsBreakdown
        items={items}
        showIncomeSources
        currency="ISK"
      />
    )
    expect(
      screen.getByRole("link", { name: "Income & costs" })
    ).toHaveAttribute("href", "/settings/income")
  })

  it("renders nothing when there is nothing to show", () => {
    const { container } = render(
      <ConfiguredAmountsBreakdown
        items={{
          incomeSourcesTotal: 0,
          offCardCosts: [],
          oneOffCosts: [],
          oneOffIncomes: [],
        }}
        showIncomeSources={false}
        currency="ISK"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
