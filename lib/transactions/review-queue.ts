"use client"

import { useCallback, useState } from "react"

import type { TransactionRow } from "@/components/transactions-table"
import { REVIEW_CONFIDENCE_CEILING } from "@/lib/transactions/review-config"
import type { ExpenseType } from "@/shared/types"

/** Persist a review decision: a type (incl. `""` for split/none) sets an override; `null` clears it. */
export type OnOverride = (id: string, type: ExpenseType | null) => void

/**
 * The transactions worth reviewing, ordered for triage. We review expenses (`amount < 0`) with no
 * manual override that are either still unclassified, or classified below
 * {@link REVIEW_CONFIDENCE_CEILING} (a weak AI guess). Mirrors the server queue so the two agree; a
 * confidently-classified row is settled and skipped. Order is least-confident-first (so the weakest
 * guesses lead), then biggest expense first.
 */
export function buildReviewQueue(rows: TransactionRow[]): TransactionRow[] {
  return rows
    .filter(
      (r) =>
        r.amount < 0 &&
        r.overrideType === null &&
        (r.classificationStatus !== "classified" ||
          (r.confidence !== null && r.confidence < REVIEW_CONFIDENCE_CEILING))
    )
    .sort((a, b) => {
      const ca = a.confidence
      const cb = b.confidence
      if (ca === null && cb === null) return a.amount - b.amount // biggest expense first
      if (ca === null) return 1 // unknown confidence sinks to the end
      if (cb === null) return -1
      if (ca !== cb) return ca - cb // least confident first
      return a.amount - b.amount // tiebreak: biggest expense first
    })
}

export interface ReviewApi {
  queue: TransactionRow[]
  idx: number
  cur: TransactionRow | undefined
  total: number
  reviewedCount: number
  done: boolean
  canUndo: boolean
  isReviewed: (id: string) => boolean
  /** Override the current transaction's type and advance to the next unreviewed one. */
  assign: (type: ExpenseType) => void
  next: () => void
  prev: () => void
  goto: (i: number) => void
  /** Revert the last assign, restoring the prior persisted state, and step back to it. */
  undo: () => void
}

interface UndoEntry {
  id: string
  idx: number
  prevType: ExpenseType | null
  prevHadOverride: boolean
}

/**
 * Drives the rapid-review session over a one-time snapshot of the queue (taken on mount, so
 * persisting a decision never reshuffles indices mid-session). Pure of the DOM — keyboard handling
 * lives in `<ReviewMode>` and calls these methods — so the queue/undo logic is unit-testable.
 */
export function useReviewQueue(
  rows: TransactionRow[],
  onOverride: OnOverride
): ReviewApi {
  const [queue] = useState(() => buildReviewQueue(rows))
  const [idx, setIdx] = useState(0)
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set())
  // A plain array (not state) — the only state derived from it is `canUndo`, kept in sync explicitly.
  const [undoStack] = useState<UndoEntry[]>(() => [])
  const [canUndo, setCanUndo] = useState(false)

  const findNextUnreviewed = useCallback(
    (from: number, reviewedSet: Set<string>) => {
      for (let i = from; i < queue.length; i++) {
        if (!reviewedSet.has(queue[i].id)) return i
      }
      for (let i = 0; i < Math.min(from, queue.length); i++) {
        if (!reviewedSet.has(queue[i].id)) return i
      }
      return Math.max(0, Math.min(from, queue.length - 1))
    },
    [queue]
  )

  const assign = useCallback(
    (type: ExpenseType) => {
      const cur = queue[idx]
      if (!cur) return
      undoStack.push({
        id: cur.id,
        idx,
        prevType: cur.overrideType,
        prevHadOverride: cur.overrideType !== null,
      })
      setCanUndo(true)
      onOverride(cur.id, type)
      const nextReviewed = new Set(reviewed).add(cur.id)
      setReviewed(nextReviewed)
      setIdx(findNextUnreviewed(idx + 1, nextReviewed))
    },
    [queue, idx, reviewed, onOverride, undoStack, findNextUnreviewed]
  )

  const next = useCallback(
    () => setIdx((i) => Math.min(i + 1, Math.max(0, queue.length - 1))),
    [queue.length]
  )
  const prev = useCallback(() => setIdx((i) => Math.max(i - 1, 0)), [])
  const goto = useCallback(
    (i: number) =>
      setIdx(Math.max(0, Math.min(i, Math.max(0, queue.length - 1)))),
    [queue.length]
  )

  const undo = useCallback(() => {
    const last = undoStack.pop()
    setCanUndo(undoStack.length > 0)
    if (!last) return
    onOverride(last.id, last.prevHadOverride ? last.prevType : null)
    setReviewed((prevSet) => {
      const nextSet = new Set(prevSet)
      nextSet.delete(last.id)
      return nextSet
    })
    setIdx(last.idx)
  }, [undoStack, onOverride])

  const isReviewed = useCallback((id: string) => reviewed.has(id), [reviewed])

  const total = queue.length
  return {
    queue,
    idx,
    cur: queue[idx],
    total,
    reviewedCount: reviewed.size,
    done: reviewed.size >= total,
    canUndo,
    isReviewed,
    assign,
    next,
    prev,
    goto,
    undo,
  }
}
