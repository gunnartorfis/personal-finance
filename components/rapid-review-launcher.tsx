"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

import { ReviewMode } from "@/components/review-mode"
import type { TransactionRow } from "@/components/transactions-table"
import { Button } from "@/components/ui/button"
import { clearOverride, putOverride } from "@/lib/overrides/client"
import type { ExpenseType } from "@/shared/types"

/**
 * Entry point for the household-wide rapid review. Unlike the per-period table, the backlog it drains
 * spans every statement cycle, so it stays reachable from any month — including an empty one you just
 * landed on. `count` is the whole-household backlog (rendered as the badge); the parent only mounts
 * this when it's > 0.
 *
 * The queue rows are fetched lazily on open (keeps the page payload light and the queue fresh), so
 * `<ReviewMode>` — which snapshots its queue on mount — is only rendered once they've arrived. Closing
 * refreshes the route so the visible period's table, summary, and this badge reflect what was settled.
 */
export function RapidReviewLauncher({
  count,
  currency,
}: {
  count: number
  currency: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<TransactionRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  const openReview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/transactions/review-queue")
      if (!res.ok) throw new Error(`review queue ${res.status}`)
      // The DB CHECK constrains the type columns to valid expense types, so the shape is trusted.
      const data = (await res.json()) as { rows: TransactionRow[] }
      setRows(data.rows)
      setOpen(true)
    } catch {
      // Leave the button ready to retry rather than opening an empty overlay.
    } finally {
      setLoading(false)
    }
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setRows(null)
    // Reconcile the page: settled rows drop out of the queue and the badge/table/summary update.
    router.refresh()
  }, [router])

  // Persist a review decision; `null` clears the override, any type (incl. `""`) sets one. The
  // overlay advances optimistically off its own snapshot and `close` refreshes to the true state, so
  // a rare failed write simply re-surfaces the row on the next open rather than corrupting anything.
  const onOverride = useCallback((id: string, type: ExpenseType | null) => {
    const persist = type === null ? clearOverride(id) : putOverride(id, type)
    persist.catch(() => {})
  }, [])

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={openReview}
        disabled={loading}
      >
        ⚡ Rapid review ({count})
      </Button>
      {open && rows && (
        <ReviewMode
          rows={rows}
          currency={currency}
          onOverride={onOverride}
          onClose={close}
        />
      )}
    </>
  )
}
