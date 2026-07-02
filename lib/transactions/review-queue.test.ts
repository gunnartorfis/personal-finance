import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { TransactionRow } from "@/components/transactions-table"
import {
  buildReviewQueue,
  useReviewQueue,
} from "@/lib/transactions/review-queue"

function row(
  partial: Partial<TransactionRow> & Pick<TransactionRow, "id">
): TransactionRow {
  return {
    date: "2026-03-01",
    merchant: partial.id,
    amount: -100,
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

describe("buildReviewQueue", () => {
  it("keeps only unclassified, non-overridden expenses, biggest first", () => {
    const rows = [
      row({ id: "credit", amount: 500 }), // excluded: not an expense
      row({ id: "settled", overrideType: "Fixed" }), // excluded: already overridden
      row({
        id: "classified",
        classifiedType: "Fixed",
        confidence: 0.9,
        classificationStatus: "classified",
      }), // excluded: AI already classified it
      row({ id: "small", amount: -50 }),
      row({ id: "big", amount: -900 }),
      row({ id: "failed", classificationStatus: "failed" }),
    ]
    expect(buildReviewQueue(rows).map((r) => r.id)).toEqual([
      "big",
      "failed",
      "small",
    ])
  })
})

describe("useReviewQueue", () => {
  const two = () => [row({ id: "a", amount: -200 }), row({ id: "b" })]

  it("assign persists the type, marks reviewed, and advances", () => {
    const onOverride = vi.fn()
    const { result } = renderHook(() => useReviewQueue(two(), onOverride))

    expect(result.current.cur?.id).toBe("a")
    act(() => result.current.assign("Necessary"))

    expect(onOverride).toHaveBeenCalledWith("a", "Necessary")
    expect(result.current.cur?.id).toBe("b")
    expect(result.current.reviewedCount).toBe(1)
  })

  it("undo reverts the last assign to no-override and steps back to it", () => {
    const onOverride = vi.fn()
    const { result } = renderHook(() => useReviewQueue(two(), onOverride))

    act(() => result.current.assign("Fixed"))
    act(() => result.current.undo())

    expect(onOverride).toHaveBeenLastCalledWith("a", null) // prior state had no override -> clear
    expect(result.current.cur?.id).toBe("a")
    expect(result.current.reviewedCount).toBe(0)
    expect(result.current.canUndo).toBe(false)
  })

  it("is done once every queued row is reviewed", () => {
    const { result } = renderHook(() =>
      useReviewQueue([row({ id: "a" })], vi.fn())
    )

    expect(result.current.done).toBe(false)
    act(() => result.current.assign("Fixed"))
    expect(result.current.done).toBe(true)
  })
})
