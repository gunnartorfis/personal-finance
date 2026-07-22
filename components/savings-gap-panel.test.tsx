import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SavingsGapPanel } from "@/components/savings-gap-panel"
import type { SavingsGapCycle } from "@/lib/dashboard/savings-gap"
import { renderWithIntl as render } from "@/lib/test/render"

const GAPS: SavingsGapCycle[] = [
  { cycleKey: "2026-01", inferred: 70_000, observedDelta: 55_000, gap: 15_000 },
  { cycleKey: "2026-02", inferred: 150_000, observedDelta: 120_000, gap: 30_000 },
]

describe("SavingsGapPanel", () => {
  it("shows inferred, observed, and gap for the latest comparable cycle", () => {
    render(<SavingsGapPanel gaps={GAPS} currency="ISK" />)
    expect(screen.getByText("Savings gap")).toBeInTheDocument()
    expect(screen.getByText(/February 2026/)).toBeInTheDocument() // the latest cycle
    expect(screen.getByText("Inferred saving")).toBeInTheDocument()
    expect(screen.getByText(/150,000/)).toBeInTheDocument()
    expect(screen.getByText(/120,000/)).toBeInTheDocument()
    expect(screen.getByText(/30,000/)).toBeInTheDocument()
  })

  it("skips uncovered cycles and uses the latest comparable one", () => {
    render(
      <SavingsGapPanel
        gaps={[
          { cycleKey: "2026-01", inferred: 70_000, observedDelta: 55_000, gap: 15_000 },
          { cycleKey: "2026-02", inferred: 150_000, observedDelta: null, gap: null }, // uncovered
        ]}
        currency="ISK"
      />
    )
    // Falls back to January (latest covered), not the uncovered February.
    expect(screen.getByText(/January 2026/)).toBeInTheDocument()
    expect(screen.getByText(/15,000/)).toBeInTheDocument()
  })

  it("renders nothing when no cycle is comparable", () => {
    const { container } = render(
      <SavingsGapPanel
        gaps={[{ cycleKey: "2026-02", inferred: 150_000, observedDelta: null, gap: null }]}
        currency="ISK"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("localizes the section for the is catalog", () => {
    render(<SavingsGapPanel gaps={GAPS} currency="ISK" />, { locale: "is" })
    expect(screen.getByText("Sparnaðarbil")).toBeInTheDocument()
  })
})
