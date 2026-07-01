import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ReviewMode } from "@/components/review-mode"
import type { TransactionRow } from "@/components/transactions-table"

function row(
  partial: Partial<TransactionRow> & Pick<TransactionRow, "id">
): TransactionRow {
  return {
    date: "2026-03-01",
    merchant: partial.id,
    amount: -100,
    classifiedType: "Fixed",
    confidence: null,
    reasoning: null,
    overrideType: null,
    classificationStatus: "classified",
    ...partial,
  }
}

// Queue orders least-confident first, so "low" is the first card.
const ROWS = [
  row({ id: "high", confidence: 0.9, classifiedType: "Necessary" }),
  row({
    id: "low",
    confidence: 0.2,
    classifiedType: "Fixed",
    reasoning: "Looks discretionary",
  }),
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
    expect(onOverride).toHaveBeenCalledWith("low", "Fixed")
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
    expect(onOverride).toHaveBeenCalledWith("low", "")
  })

  it("accepts the AI guess on Space without writing an override", () => {
    const onOverride = vi.fn()
    render(
      <ReviewMode
        rows={ROWS}
        currency="ISK"
        onOverride={onOverride}
        onClose={vi.fn()}
      />
    )

    fireEvent.keyDown(window, { key: " " })
    expect(onOverride).not.toHaveBeenCalled()
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

  it("shows the AI suggestion, confidence, and reasoning for the current card", () => {
    render(
      <ReviewMode
        rows={ROWS}
        currency="ISK"
        onOverride={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/AI suggests/i)).toBeInTheDocument()
    expect(screen.getByText(/confident/i)).toBeInTheDocument()
    expect(screen.getByText(/looks discretionary/i)).toBeInTheDocument()
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
        rows={[row({ id: "only", confidence: 0.2 })]}
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

  it("does not crash on a classified split/none expense", () => {
    render(
      <ReviewMode
        rows={[row({ id: "split", confidence: 0.5, classifiedType: "" })]}
        currency="ISK"
        onOverride={vi.fn()}
        onClose={vi.fn()}
      />
    )
    // No AI-suggestion pill is rendered for `""`; it must not throw on a TYPE_META[""] lookup.
    expect(screen.queryByText(/AI suggests/i)).not.toBeInTheDocument()
  })
})
