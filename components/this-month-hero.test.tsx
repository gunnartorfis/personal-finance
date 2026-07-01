import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ThisMonthHero } from "@/components/this-month-hero"
import type { DashboardHero } from "@/lib/dashboard/dashboard-view"

const HERO: DashboardHero = {
  month: "2026-03",
  spentSoFar: 100000,
  projected: 310000,
  moneyIn: 20000,
  difference: -80000,
  vsAveragePct: 12,
  trailingAverage: 312500,
  largestCharge: { merchant: "BIGSHOP", amount: 89000 },
}

describe("ThisMonthHero", () => {
  it("leads with spending so far, labelled by the current cycle", () => {
    render(<ThisMonthHero hero={HERO} currency="ISK" />)
    expect(screen.getByText("March 2026")).toBeInTheDocument()
    expect(screen.getByText(/Spending so far/i)).toBeInTheDocument()
    expect(screen.getByText(/100,000/)).toBeInTheDocument()
  })

  it("shows the projection, Money in and Difference", () => {
    render(<ThisMonthHero hero={HERO} currency="ISK" />)
    expect(screen.getByText(/Projected/i)).toHaveTextContent(/310,000/)
    expect(screen.getByText("Money in")).toBeInTheDocument()
    expect(screen.getByText(/20,000/)).toBeInTheDocument()
    expect(screen.getByText("Difference")).toBeInTheDocument()
    expect(screen.getByText(/80,000/)).toBeInTheDocument() // difference magnitude
  })

  it("shows neutral info lines: signed vs-average and the largest charge", () => {
    render(<ThisMonthHero hero={HERO} currency="ISK" />)
    expect(screen.getByText(/\+12% vs your average/i)).toBeInTheDocument()
    expect(screen.getByText(/Largest charge/i)).toHaveTextContent(/BIGSHOP/)
    expect(screen.getByText(/Largest charge/i)).toHaveTextContent(/89,000/)
  })

  it("renders a negative vs-average delta with a minus sign", () => {
    render(<ThisMonthHero hero={{ ...HERO, vsAveragePct: -8 }} currency="ISK" />)
    expect(screen.getByText(/-8% vs your average/i)).toBeInTheDocument()
  })

  it("shows a flat 0% delta without a plus prefix", () => {
    render(<ThisMonthHero hero={{ ...HERO, vsAveragePct: 0 }} currency="ISK" />)
    expect(screen.getByText(/ran 0% vs your average/i)).toBeInTheDocument()
    expect(screen.queryByText(/\+0%/)).not.toBeInTheDocument()
  })

  it("omits the projection and info lines when their data is absent", () => {
    render(
      <ThisMonthHero
        hero={{ ...HERO, projected: null, vsAveragePct: null, trailingAverage: null, largestCharge: null }}
        currency="ISK"
      />,
    )
    expect(screen.queryByText(/Projected/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/vs your average/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Largest charge/i)).not.toBeInTheDocument()
    // The hero core still renders.
    expect(screen.getByText(/Spending so far/i)).toBeInTheDocument()
    expect(screen.getByText("Difference")).toBeInTheDocument()
  })
})
