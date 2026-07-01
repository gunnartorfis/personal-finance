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
    classifiedType: "Fixed",
    confidence: null,
    reasoning: null,
    overrideType: null,
    classificationStatus: "classified",
    ...partial,
  }
}

describe("buildReviewQueue", () => {
  it("keeps only non-overridden expenses, least-confident first, unknown confidence last", () => {
    const rows = [
      row({ id: "credit", amount: 500 }), // excluded: not an expense
      row({ id: "settled", overrideType: "Fixed" }), // excluded: already overridden
      row({ id: "high", confidence: 0.9 }),
      row({ id: "low", confidence: 0.2 }),
      row({
        id: "pending",
        confidence: null,
        classifiedType: null,
        classificationStatus: "pending",
      }),
    ]
    expect(buildReviewQueue(rows).map((r) => r.id)).toEqual([
      "low",
      "high",
      "pending",
    ])
  })
})

describe("useReviewQueue", () => {
  const two = () => [
    row({ id: "a", confidence: 0.1 }),
    row({ id: "b", confidence: 0.2 }),
  ]

  it("assign persists the type, marks reviewed, and advances", () => {
    const onOverride = vi.fn()
    const { result } = renderHook(() => useReviewQueue(two(), onOverride))

    expect(result.current.cur?.id).toBe("a")
    act(() => result.current.assign("Necessary"))

    expect(onOverride).toHaveBeenCalledWith("a", "Necessary")
    expect(result.current.cur?.id).toBe("b")
    expect(result.current.reviewedCount).toBe(1)
  })

  it("accept advances without writing an override", () => {
    const onOverride = vi.fn()
    const { result } = renderHook(() => useReviewQueue(two(), onOverride))

    act(() => result.current.accept())

    expect(onOverride).not.toHaveBeenCalled()
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
      useReviewQueue([row({ id: "a", confidence: 0.1 })], vi.fn())
    )

    expect(result.current.done).toBe(false)
    act(() => result.current.assign("Fixed"))
    expect(result.current.done).toBe(true)
  })
})
