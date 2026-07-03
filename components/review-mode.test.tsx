import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ReviewMode } from "@/components/review-mode"
import type { TransactionRow } from "@/components/transactions-table"
import { renderWithIntl as render } from "@/lib/test/render"

function row(
  partial: Partial<TransactionRow> & Pick<TransactionRow, "id">
): TransactionRow {
  return {
    date: "2026-03-01",
    merchant: partial.id,
    amount: -100,
    ownShareAmount: null,
    incomeMarked: false,
    excluded: false,
    exclusionNote: null,
    classifiedType: null,
    confidence: null,
    reasoning: null,
    overrideType: null,
    classificationStatus: "pending",
    ...partial,
  }
}

// Queue orders biggest expense first, so "big" is the first card.
const ROWS = [
  row({ id: "small", amount: -50 }),
  row({ id: "big", amount: -900, classificationStatus: "failed" }),
]

describe("ReviewMode", () => {
  it("assigns the type on a number key and persists via onOverride", () => {
    const onOverride = vi.fn()
    render(
      <ReviewMode
        rows={ROWS}
        currency="ISK"
        onOverride={onOverride}
        onClose={vi.fn()}
      />
    )

    fireEvent.keyDown(window, { key: "1" })
    expect(onOverride).toHaveBeenCalledWith("big", "Fixed")
  })

  it("sets split/none on the 0 key", () => {
    const onOverride = vi.fn()
    render(
      <ReviewMode
        rows={ROWS}
        currency="ISK"
        onOverride={onOverride}
        onClose={vi.fn()}
      />
    )

    fireEvent.keyDown(window, { key: "0" })
    expect(onOverride).toHaveBeenCalledWith("big", "")
  })

  it("closes on Escape", () => {
    const onClose = vi.fn()
    render(
      <ReviewMode
        rows={ROWS}
        currency="ISK"
        onOverride={vi.fn()}
        onClose={onClose}
      />
    )

    fireEvent.keyDown(window, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("shows the classification status for the current card", () => {
    render(
      <ReviewMode
        rows={ROWS}
        currency="ISK"
        onOverride={vi.fn()}
        onClose={vi.fn()}
      />
    )

    // First card is "big", which failed classification.
    expect(screen.getByText(/classification failed/i)).toBeInTheDocument()
  })

  it("excludes AI-classified rows from the queue", () => {
    render(
      <ReviewMode
        rows={[
          row({
            id: "done",
            classifiedType: "Fixed",
            confidence: 0.9,
            classificationStatus: "classified",
          }),
        ]}
        currency="ISK"
        onOverride={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText(/nothing to review/i)).toBeInTheDocument()
  })

  it("shows an empty state when nothing needs review", () => {
    render(
      <ReviewMode
        rows={[row({ id: "credit", amount: 500 })]}
        currency="ISK"
        onOverride={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText(/nothing to review/i)).toBeInTheDocument()
  })

  it("ignores assignment keys on the completion screen (no re-persist)", () => {
    const onOverride = vi.fn()
    render(
      <ReviewMode
        rows={[row({ id: "only" })]}
        currency="ISK"
        onOverride={onOverride}
        onClose={vi.fn()}
      />
    )

    fireEvent.keyDown(window, { key: "1" }) // settles the only card -> done screen
    expect(onOverride).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()

    fireEvent.keyDown(window, { key: "2" }) // reflexive keypress on the done screen: ignored
    expect(onOverride).toHaveBeenCalledTimes(1)
  })
})
