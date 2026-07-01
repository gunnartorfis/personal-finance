import Link from "next/link"

import { CATEGORIES, SpendingByType } from "@/components/spending-by-type"
import type { CategoryTrendPoint } from "@/lib/dashboard/category-trend"
import type { CycleKey } from "@/lib/dashboard/cycle"
import { cycleKeyLabel, shortCycleLabel } from "@/lib/dashboard/cycle"
import type { NetSummary } from "@/lib/dashboard/net-summary"
import { cn } from "@/lib/utils"

/**
 * Adapt a category-trend point (positive magnitudes) to the {@link NetSummary} shape
 * {@link SpendingByType} consumes. Only the expense-side fields matter to that component; income/net
 * are unused, so they mirror the (negated) expense total.
 */
function pointToNetSummary(point: CategoryTrendPoint): NetSummary {
  const byType = point.byExpenseType
  const expense = -(byType.Fixed + byType.Necessary + byType["Nice to have"] + byType[""] + point.unclassified)
  return {
    income: 0,
    expense,
    net: expense,
    byExpenseType: {
      Fixed: -byType.Fixed,
      Necessary: -byType.Necessary,
      "Nice to have": -byType["Nice to have"],
      "": -byType[""],
    },
    unclassified: -point.unclassified,
  }
}

/** Magnitude per display category (CATEGORIES order) for one month's stacked bar. */
function segmentsFor(point: CategoryTrendPoint) {
  return CATEGORIES.map((category) => {
    const magnitude =
      category.key === "Other"
        ? point.byExpenseType[""]
        : category.key === "Unclassified"
          ? point.unclassified
          : point.byExpenseType[category.key]
    return { key: category.key, label: category.label, swatch: category.swatch, magnitude }
  })
}

/** Accessible description of one month's mix, e.g. "March 2026 spending mix: Fixed 60%, Nice to have 40%". */
function mixLabel(
  month: CycleKey,
  segments: ReadonlyArray<{ label: string; magnitude: number }>,
  total: number,
): string {
  const label = cycleKeyLabel(month)
  if (total === 0) return `${label}: no spending recorded`
  const parts = segments
    .filter((segment) => segment.magnitude > 0)
    .map((segment) => `${segment.label} ${Math.round((segment.magnitude / total) * 100)}%`)
  return `${label} spending mix: ${parts.join(", ")}`
}

/**
 * The category-mix module (Phase K, K12): the current cycle's spending-by-type breakdown (reusing
 * {@link SpendingByType} so it reads identically to the transactions view) plus a compact
 * 100%-normalized stacked bar per month showing how the mix shifts over time. When most spend is
 * still unclassified, a nudge points to classification since the buckets aren't meaningful yet.
 */
export function CategoryMixModule({
  categoryTrend,
  currentMonth,
  mostlyUnclassified,
  currency,
  className,
}: {
  categoryTrend: CategoryTrendPoint[]
  currentMonth: CycleKey
  mostlyUnclassified: boolean
  currency: string
  className?: string
}) {
  const current = categoryTrend.find((point) => point.month === currentMonth) ?? null

  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}>
      <h2 className="text-base font-medium">Where it goes</h2>

      {mostlyUnclassified && (
        <div className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          Most of your spending isn&apos;t classified yet.{" "}
          <Link
            href="/transactions"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Classify transactions
          </Link>{" "}
          to unlock category insights.
        </div>
      )}

      {current && <SpendingByType summary={pointToNetSummary(current)} currency={currency} headingLevel={3} />}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Mix over time</h3>
        <div className="flex items-end gap-1.5 overflow-x-auto">
          {categoryTrend.map((point) => {
            const segments = segmentsFor(point)
            const total = segments.reduce((sum, segment) => sum + segment.magnitude, 0)
            return (
              <div key={point.month} className="flex min-w-6 flex-1 flex-col items-center gap-1.5">
                <div
                  role="img"
                  aria-label={mixLabel(point.month, segments, total)}
                  className="flex h-24 w-full flex-col-reverse overflow-hidden rounded-sm bg-muted"
                >
                  {total > 0 &&
                    segments.map(
                      (segment) =>
                        segment.magnitude > 0 && (
                          <div
                            key={segment.key}
                            className={cn("w-full", segment.swatch)}
                            style={{ height: `${(segment.magnitude / total) * 100}%` }}
                          />
                        ),
                    )}
                </div>
                <span aria-hidden="true" className="text-[10px] tabular-nums text-muted-foreground">
                  {shortCycleLabel(point.month)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
