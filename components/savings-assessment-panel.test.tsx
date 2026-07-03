import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SavingsAssessmentPanel } from "@/components/savings-assessment-panel"
import type { SavingsAssessment, SavingsCycle } from "@/lib/savings/assessment"

const assessment: SavingsAssessment = {
  cycleKey: "2026-08",
  cumulative: 900_000,
  requiredCumulative: 800_000,
  onTrack: true,
  cyclesElapsed: 2,
  cyclesRemaining: 10,
  requiredSaving: 200_000,
  expectedFixed: 120_000,
  expectedNecessary: 80_000,
  expectedSource: "history",
  allowedNiceToHave: 100_000,
  provisional: true,
}

// Two completed cycles plus the in-progress 2026-08 (ADR-0014).
const cycles: SavingsCycle[] = [
  { cycleKey: "2026-06", monthlyIncome: 1_000_000, offCardFixed: 200_000, cardDebits: 500_000, inferredSaving: 300_000, inProgress: false },
  { cycleKey: "2026-07", monthlyIncome: 1_000_000, offCardFixed: 200_000, cardDebits: 300_000, inferredSaving: 500_000, inProgress: false },
  { cycleKey: "2026-08", monthlyIncome: 1_000_000, offCardFixed: 200_000, cardDebits: 40_000, inferredSaving: 760_000, inProgress: true },
]

function renderPanel(overrides?: Partial<{ assessment: SavingsAssessment; cycles: SavingsCycle[] }>) {
  return render(
    <SavingsAssessmentPanel
      assessment={overrides?.assessment ?? assessment}
      cycles={overrides?.cycles ?? cycles}
      currency="ISK"
      locale="en"
    />,
  )
}

describe("SavingsAssessmentPanel", () => {
  it("flags the in-progress cycle row as not yet counted, not as a saved amount", () => {
    renderPanel()
    const row = screen.getByText(/August 2026 \(this month\)/).closest("tr")!
    expect(within(row).getByText(/not yet counted/i)).toBeInTheDocument()
    // Its spiky inferred saving must NOT be shown as a counted figure.
    expect(within(row).queryByText("ISK 760,000")).not.toBeInTheDocument()
  })

  it("still shows the in-progress row's spend so far (card debits)", () => {
    renderPanel()
    const row = screen.getByText(/August 2026 \(this month\)/).closest("tr")!
    expect(within(row).getByText("ISK 40,000")).toBeInTheDocument()
  })

  it("shows completed cycles' saved amounts normally", () => {
    renderPanel()
    const row = screen.getByText("June 2026").closest("tr")!
    expect(within(row).getByText("ISK 300,000")).toBeInTheDocument()
  })

  it("labels the in-progress row as this month", () => {
    renderPanel()
    const row = screen.getByText(/August 2026 \(this month\)/).closest("tr")!
    expect(within(row).getByText(/\(this month\)/i)).toBeInTheDocument()
  })

  it("names the current month in the not-yet-counted banner", () => {
    renderPanel()
    expect(screen.getByText(/August 2026 isn.t in your total yet/i)).toBeInTheDocument()
    expect(screen.getByText(/counts once the month closes/i)).toBeInTheDocument()
  })

  it("shows a getting-started on-track message when no cycle has closed", () => {
    renderPanel({
      assessment: {
        ...assessment,
        cyclesElapsed: 0,
        cumulative: 2_000_000,
        requiredCumulative: 2_000_000,
        onTrack: true,
      },
      cycles: cycles.filter((c) => c.inProgress),
    })
    expect(screen.getByText(/On track — ISK 2,000,000 saved so far/i)).toBeInTheDocument()
    // No tautological "needed by now" when nothing is due yet.
    expect(screen.queryByText(/needed by now/i)).not.toBeInTheDocument()
  })

  it("hides the provisional banner when the assessment is not provisional", () => {
    renderPanel({
      assessment: { ...assessment, provisional: false },
      cycles: cycles.filter((c) => !c.inProgress),
    })
    expect(screen.queryByText(/counts once the (calendar )?month closes/i)).not.toBeInTheDocument()
  })
})
