"use client"

import { Sparkles, TriangleAlert } from "lucide-react"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { ClassifyTrigger } from "@/components/classify-trigger"

/** Household-wide backlog snapshot from `GET /api/classify/status`. */
interface ClassifyStatus {
  pending: number
  failed: number
  paused: boolean
}

/** Poll cadence while a backlog is showing — brisk enough to feel live as a drain empties the queue. */
const POLL_MS = 2500

/**
 * System-wide classification banner (ADR-0005). CSV classification is browser-driven: a refresh or
 * navigation aborts the in-tab drain loop, so completed rows persist but the remaining `pending`
 * rows just sit there with nothing surfacing them off the dashboard. This banner is the safety net —
 * it fetches the Household's backlog on every page and, while any remains, offers the manual
 * "Classify pending" / "Retry failed" affordances (reusing {@link ClassifyTrigger}) and polls until
 * the queue clears, then hides itself.
 *
 * It renders nothing on `/dashboard`, whose {@link import("@/components/action-band").ActionBand}
 * already carries these same cards, and (mirroring that band) hides the pending affordance while the
 * Free cap has classification paused — a capped drain would skip every expense row anyway.
 */
export function ClassificationBanner() {
  const pathname = usePathname()
  const [status, setStatus] = useState<ClassifyStatus | null>(null)

  // Fetches the backlog and returns it (no setState) so callers can apply the result inside an async
  // `.then` — keeps the state update off the effect's synchronous path. Returns null on any transient
  // failure (network / abort / non-2xx); the next poll or navigation refetches.
  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/classify/status", { signal })
      return res.ok ? ((await res.json()) as ClassifyStatus) : null
    } catch {
      return null
    }
  }, [])

  const onDashboard = pathname === "/dashboard"

  // Refetch on first mount and on every client navigation (the layout keeps this mounted across
  // route changes, so pathname is the signal) — so a backlog created elsewhere surfaces as soon as
  // the user lands on any non-dashboard page. Skip the dashboard, which surfaces the backlog itself.
  useEffect(() => {
    if (onDashboard) return
    const controller = new AbortController()
    void fetchStatus(controller.signal).then((next) => {
      if (next) setStatus(next)
    })
    return () => controller.abort()
  }, [onDashboard, pathname, fetchStatus])

  const pending = status?.pending ?? 0
  const failed = status?.failed ?? 0
  const showPending = pending > 0 && !status?.paused
  const visible = !onDashboard && (showPending || failed > 0)

  // Keep the counts fresh while the banner is up so it reflects a running drain (this tab or another)
  // and disappears once the queue is empty. Idle pages never poll.
  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => {
      void fetchStatus().then((next) => {
        if (next) setStatus(next)
      })
    }, POLL_MS)
    return () => clearInterval(id)
  }, [visible, fetchStatus])

  if (!visible) return null

  return (
    <div className="flex flex-col gap-3 px-4 pt-4">
      {showPending && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <Sparkles aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm">
              <span className="font-medium">
                {pending} transaction{pending === 1 ? "" : "s"} awaiting classification
              </span>
              <span className="text-muted-foreground"> — run AI classification to bucket them.</span>
            </p>
          </div>
          <ClassifyTrigger />
        </div>
      )}

      {failed > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <TriangleAlert
              aria-hidden="true"
              className="size-4 shrink-0 text-amber-600 dark:text-amber-500"
            />
            <p className="text-sm">
              <span className="font-medium">
                {failed} classification{failed === 1 ? "" : "s"} failed
              </span>
              <span className="text-muted-foreground"> — retry to finish bucketing them.</span>
            </p>
          </div>
          <ClassifyTrigger failedCount={failed} retryOnly />
        </div>
      )}
    </div>
  )
}
