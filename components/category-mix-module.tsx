import { useTranslations } from "next-intl"
import Link from "next/link"

import { MixOverTimeChart } from "@/components/mix-over-time-chart"
import { SpendingByType } from "@/components/spending-by-type"
import {
  categoryPointToNetSummary,
  type CategoryTrendPoint,
} from "@/lib/dashboard/category-trend"
import type { CycleKey } from "@/lib/dashboard/cycle"
import { cn } from "@/lib/utils"

/**
 * The category-mix module (Phase K, K12): the current cycle's spending-by-type breakdown (reusing
 * {@link SpendingByType} so it reads identically to the transactions view) plus a 100%-normalized
 * stacked bar per month ({@link MixOverTimeChart}) showing how the mix shifts over time. When most
 * spend is still unclassified, a nudge points to classification since the buckets aren't meaningful yet.
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
  const t = useTranslations("charts.categoryMix")
  const current =
    categoryTrend.find((point) => point.month === currentMonth) ?? null

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

      <MixOverTimeChart categoryTrend={categoryTrend} currency={currency} />
    </section>
  )
}
