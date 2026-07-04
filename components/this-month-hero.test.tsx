import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ThisMonthHero } from "@/components/this-month-hero"
import type { DashboardHero } from "@/lib/dashboard/dashboard-view"
import { renderWithIntl as render } from "@/lib/test/render"

// The embedded PeriodSelector calls useRouter for its `?cycle=` navigation.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

const HERO: DashboardHero = {
  month: "2026-03",
  isCurrent: true,
  spentSoFar: 100000,
  projected: 310000,
  income: 20000,
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

  it("shows the projection, Income and Difference", () => {
    render(<ThisMonthHero hero={HERO} currency="ISK" />)
    expect(screen.getByText(/Projected/i)).toHaveTextContent(/310,000/)
    expect(screen.getByText("Income")).toBeInTheDocument()
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

  it("renders a period selector and past-month framing when options are supplied", () => {
    render(
      <ThisMonthHero
        hero={{ ...HERO, isCurrent: false, month: "2026-01", projected: null }}
        currency="ISK"
        options={[
          { key: "2026-03", label: "March 2026" },
          { key: "2026-01", label: "January 2026" },
        ]}
        selected="2026-01"
      />,
    )
    // The month is picked via the selector, which reflects the selected cycle.
    const select = screen.getByLabelText("Statement period") as HTMLSelectElement
    expect(select.value).toBe("2026-01")
    // A completed month reads as a final total, with no "This month" tag and no projection.
    expect(screen.getByText("Total spent")).toBeInTheDocument()
    expect(screen.queryByText("This month")).not.toBeInTheDocument()
    expect(screen.queryByText(/Projected/i)).not.toBeInTheDocument()
    // Its vs-average line drops the "last full month" framing.
    expect(screen.getByText(/\+12% vs your average of/i)).toBeInTheDocument()
    expect(screen.queryByText(/last full month/i)).not.toBeInTheDocument()
  })
})
