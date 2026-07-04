import { useTranslations } from "next-intl"
import Link from "next/link"

import { MixOverTimeChart } from "@/components/mix-over-time-chart"
import { SpendingByType } from "@/components/spending-by-type"
import {
  categoryPointToNetSummary,
  foldOffCardIntoFixed,
  type CategoryTrendPoint,
} from "@/lib/dashboard/category-trend"
import type { CycleKey } from "@/lib/dashboard/cycle"
import type { MonthlySpendPoint } from "@/lib/dashboard/monthly-series"
import { cn } from "@/lib/utils"

/**
 * The category-mix module (Phase K, K12): the current cycle's spending-by-type breakdown (reusing
 * {@link SpendingByType} so it reads identically to the transactions view) plus a 100%-normalized
 * stacked bar per month ({@link MixOverTimeChart}) showing how the mix shifts over time. When most
 * spend is still unclassified, a nudge points to classification since the buckets aren't meaningful yet.
 */
export function CategoryMixModule({
  categoryTrend,
  series,
  currentMonth,
  mostlyUnclassified,
  currency,
  className,
}: {
  categoryTrend: CategoryTrendPoint[]
  /** The spend series (card + off-card fixed per cycle) used to fold off-card costs into Fixed. */
  series: MonthlySpendPoint[]
  currentMonth: CycleKey
  mostlyUnclassified: boolean
  currency: string
  className?: string
}) {
  const t = useTranslations("charts.categoryMix")
  // Fold each cycle's configured off-card fixed costs into its Fixed bucket so both the current-cycle
  // breakdown and the over-time strip reflect true total spend, not just card debits (ADR-0015).
  const trend = foldOffCardIntoFixed(categoryTrend, series)
  const current = trend.find((point) => point.month === currentMonth) ?? null

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border bg-card p-6",
        className
      )}
    >
      <h2 className="text-base font-medium">{t("title")}</h2>

      {mostlyUnclassified && (
        <div className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          {t.rich("unclassifiedNudge", {
            link: (chunks) => (
              <Link
                href="/transactions"
                className="font-medium text-foreground underline underline-offset-4"
              >
                {chunks}
              </Link>
            ),
          })}
        </div>
      )}

      {current && (
        <SpendingByType
          summary={categoryPointToNetSummary(current)}
          currency={currency}
          headingLevel={3}
        />
      )}

      <MixOverTimeChart categoryTrend={trend} currency={currency} />
    </section>
  )
}
