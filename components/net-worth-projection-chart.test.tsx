import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { NetWorthProjectionChart } from "@/components/net-worth-projection-chart"
import type { ProjectionPoint } from "@/lib/dashboard/net-worth"
import { renderWithIntl as render } from "@/lib/test/render"

const POINTS: ProjectionPoint[] = [
  { cycleKey: "2026-07", monthIndex: 0, netWorth: 1_000_000 },
  { cycleKey: "2026-08", monthIndex: 1, netWorth: 1_050_000 },
  { cycleKey: "2027-07", monthIndex: 12, netWorth: 1_600_000 },
]

describe("NetWorthProjectionChart", () => {
  it("titles the projection and states the year-out figure (the last point)", () => {
    render(<NetWorthProjectionChart points={POINTS} currency="ISK" />)
    expect(screen.getByText("Net worth projection")).toBeInTheDocument()
    expect(screen.getByText(/about .*1,600,000.* a year from now/i)).toBeInTheDocument()
  })

  it("exposes each projected point to screen readers", () => {
    render(<NetWorthProjectionChart points={POINTS} currency="ISK" />)
    // The sr-only list carries one entry per point with its formatted amount.
    expect(screen.getByText(/July 2026: .*1,000,000/)).toBeInTheDocument()
    expect(screen.getByText(/July 2027: .*1,600,000/)).toBeInTheDocument()
  })

  it("localizes the section for the is catalog", () => {
    render(<NetWorthProjectionChart points={POINTS} currency="ISK" />, { locale: "is" })
    expect(screen.getByText("Spá um hreina eign")).toBeInTheDocument()
  })
})
