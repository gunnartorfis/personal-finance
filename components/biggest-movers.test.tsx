import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { BiggestMovers } from "@/components/biggest-movers"
import type { Mover } from "@/lib/dashboard/movers"

const MOVERS: { merchants: Mover[]; categories: Mover[] } = {
  merchants: [{ name: "BONUS", lastMonth: 400, baselineAverage: 100, delta: 300, deltaPct: 300 }],
  categories: [
    { name: "Necessary", lastMonth: 400, baselineAverage: 100, delta: 300, deltaPct: 300 },
    { name: "Nice to have", lastMonth: 200, baselineAverage: 0, delta: 200, deltaPct: null }, // new
  ],
}

describe("BiggestMovers", () => {
  it("renders nothing when there are no movers", () => {
    const { container } = render(
      <BiggestMovers movers={{ merchants: [], categories: [] }} currency="ISK" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("lists merchant and category risers with their delta and percent", () => {
    render(<BiggestMovers movers={MOVERS} currency="ISK" />)
    expect(screen.getByText("Biggest movers")).toBeInTheDocument()
    expect(screen.getByText("Merchants")).toBeInTheDocument()
    expect(screen.getByText("Categories")).toBeInTheDocument()
    expect(screen.getByText("BONUS")).toBeInTheDocument()
    expect(screen.getByText("Necessary")).toBeInTheDocument()
    expect(screen.getByText("Nice to have")).toBeInTheDocument()
    // BONUS and Necessary both rose +300%.
    expect(screen.getAllByText(/\+300%/)).toHaveLength(2)
    // A riser with no baseline reads as "new".
    expect(screen.getByText(/new/i)).toBeInTheDocument()
  })

  it("omits a section that has no risers", () => {
    render(<BiggestMovers movers={{ merchants: MOVERS.merchants, categories: [] }} currency="ISK" />)
    expect(screen.getByText("Merchants")).toBeInTheDocument()
    expect(screen.queryByText("Categories")).not.toBeInTheDocument()
  })
})
