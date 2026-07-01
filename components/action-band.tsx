import { ArrowRight, CircleCheck, ClipboardCheck, TriangleAlert } from "lucide-react"
import Link from "next/link"

import { ClassifyTrigger } from "@/components/classify-trigger"
import { FreeCapStatusBanner } from "@/components/free-cap-status"
import type { DashboardActionBand } from "@/lib/dashboard/dashboard-view"
import { cn } from "@/lib/utils"

/**
 * The dashboard's top "needs attention" band (Phase K, K9). Each alert surfaces only when it fires:
 * the Free-cap state (reusing {@link FreeCapStatusBanner}), a review-backlog link, and a failed-
 * classification retry (reusing {@link ClassifyTrigger}). When nothing needs attention, a single
 * all-clear card stands in so the band never renders empty. Prop-driven off the view-model's
 * {@link DashboardActionBand} so it's a pure render.
 */
export function ActionBand({
  actionBand,
  className,
}: {
  actionBand: DashboardActionBand
  className?: string
}) {
  const { reviewBacklog, failedCount, freeCap, allClear } = actionBand

  return (
    <section aria-label="Needs attention" className={cn("flex flex-col gap-3", className)}>
      <FreeCapStatusBanner status={freeCap} />

      {reviewBacklog > 0 && (
        <Link
          href="/transactions"
          className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted"
        >
          <ClipboardCheck aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium">
              {reviewBacklog} {reviewBacklog === 1 ? "expense needs" : "expenses need"} review
            </span>
            <span className="text-muted-foreground"> — confirm their spending types.</span>
          </span>
          <ArrowRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
          />
        </Link>
      )}

      {failedCount > 0 && (
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
                {failedCount} classification{failedCount === 1 ? "" : "s"} failed
              </span>
              <span className="text-muted-foreground"> — retry to finish bucketing them.</span>
            </p>
          </div>
          <ClassifyTrigger failedCount={failedCount} />
        </div>
      )}

      {allClear && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <CircleCheck
            aria-hidden="true"
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-500"
          />
          <p className="text-sm font-medium">You&apos;re all caught up.</p>
        </div>
      )}
    </section>
  )
}
