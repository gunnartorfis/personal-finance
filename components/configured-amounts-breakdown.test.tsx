import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ConfiguredAmountsBreakdown } from "@/components/configured-amounts-breakdown"
import type { CycleAmountsBreakdown } from "@/shared/income-timeline"
import { renderWithIntl as render } from "@/lib/test/render"

const breakdown: CycleAmountsBreakdown = {
  recurringIncome: 500_000,
  oneOffIncome: 0,
  recurringOffCardCost: 40_000,
  oneOffCost: 10_000,
}

describe("ConfiguredAmountsBreakdown", () => {
  it("labels each configured amount that is present this cycle", () => {
    render(<ConfiguredAmountsBreakdown breakdown={breakdown} currency="ISK" />)
    expect(screen.getByText("Also counted")).toBeInTheDocument()
    expect(screen.getByText("Off-card costs")).toBeInTheDocument()
    expect(screen.getByText("One-off adjustments (cost)")).toBeInTheDocument()
    expect(screen.getByText("Income sources")).toBeInTheDocument()
  })

  it("hides a line whose amount is zero this cycle", () => {
    render(<ConfiguredAmountsBreakdown breakdown={breakdown} currency="ISK" />)
    // oneOffIncome is 0, so its row must not appear.
    expect(
      screen.queryByText("One-off adjustments (income)")
    ).not.toBeInTheDocument()
  })

  it("links to the income & costs settings so the amounts can be edited", () => {
    render(<ConfiguredAmountsBreakdown breakdown={breakdown} currency="ISK" />)
    const link = screen.getByRole("link", { name: "Income & costs" })
    expect(link).toHaveAttribute("href", "/settings/income")
  })

  it("shows a cost as a negative magnitude and income as positive", () => {
    render(<ConfiguredAmountsBreakdown breakdown={breakdown} currency="ISK" />)
    // Off-card cost of 40,000 subtracts from the total, so it reads negative.
    expect(screen.getByText(/-.*40,000/)).toBeInTheDocument()
    // Recurring income adds, so it reads as a plain positive magnitude.
    expect(screen.getByText(/^[^-]*500,000/)).toBeInTheDocument()
  })

  it("renders nothing when no amount is configured for the cycle", () => {
    const { container } = render(
      <ConfiguredAmountsBreakdown
        breakdown={{
          recurringIncome: 0,
          oneOffIncome: 0,
          recurringOffCardCost: 0,
          oneOffCost: 0,
        }}
        currency="ISK"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
