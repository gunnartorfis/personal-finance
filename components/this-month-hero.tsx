import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import type { DashboardHero } from "@/lib/dashboard/dashboard-view"
import { currencyFormatter } from "@/lib/format/currency"
import { formatCycleMonth } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The dashboard's current-cycle headline (Phase K, K10). Spending is the hero (ADR-0008): the big
 * number is what's been spent so far this month, with a linear month-end projection beneath it.
 * Income and Difference are secondary. Two neutral, never-alarming info lines add context — how the
 * last completed month compared to the trailing average, and the cycle's largest single charge. Pure
 * and prop-driven off the view-model's {@link DashboardHero}.
 */
export function ThisMonthHero({
  hero,
  currency,
  className,
}: {
  hero: DashboardHero
  currency: string
  className?: string
}) {
  const t = useTranslations("dashboard")
  const locale = toLocale(useLocale()) ?? defaultLocale
  // One formatter instance, reused across the card (not re-created per value).
  const money = currencyFormatter(currency, locale)
  const fmt = (amount: number) => money.format(amount)

  const { month, spentSoFar, projected, income, difference, vsAveragePct, trailingAverage, largestCharge } =
    hero
  const hasInfo = vsAveragePct !== null || largestCharge !== null
  // Direction cue: up only when above average, down when below, flat at exactly the average.
  const TrendIcon = vsAveragePct === null || vsAveragePct === 0 ? Minus : vsAveragePct > 0 ? ArrowUpRight : ArrowDownRight
  const deltaLabel = vsAveragePct === null ? "" : `${vsAveragePct > 0 ? "+" : ""}${vsAveragePct}%`

  return (
    <section className={cn("@container flex flex-col gap-6 rounded-xl border border-border bg-card p-6", className)}>
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-medium">{formatCycleMonth(month, locale)}</h2>
        <span className="text-sm text-muted-foreground">{t("thisMonth")}</span>
      </header>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{t("spendingSoFar")}</span>
        <span className="text-3xl font-semibold tabular-nums">{fmt(spentSoFar)}</span>
        {projected !== null && (
          <span className="text-sm text-muted-foreground">
            {t("projected", { amount: fmt(projected) })}
          </span>
        )}
      </div>

      {hasInfo && (
        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {vsAveragePct !== null && (
            <p className="flex items-center gap-1.5">
              <TrendIcon aria-hidden="true" className="size-4 shrink-0" />
              <span>
                {trailingAverage !== null
                  ? t("vsAverageWithAvg", { delta: deltaLabel, average: fmt(trailingAverage) })
                  : t("vsAverage", { delta: deltaLabel })}
              </span>
            </p>
          )}
          {largestCharge !== null && (
            <p>
              {t("largestCharge", {
                merchant: largestCharge.merchant,
                amount: fmt(largestCharge.amount),
              })}
            </p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-1 divide-y divide-border @xs:grid-cols-2 @xs:divide-x @xs:divide-y-0">
        <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @xs:px-4 @xs:py-0 @xs:first:pl-0 @xs:last:pr-0">
          <dt className="truncate text-sm text-muted-foreground">{t("income")}</dt>
          <dd className="text-lg font-semibold tabular-nums">{fmt(income)}</dd>
        </div>
        <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @xs:px-4 @xs:py-0 @xs:first:pl-0 @xs:last:pr-0">
          <dt className="truncate text-sm text-muted-foreground">{t("difference")}</dt>
          <dd className="text-lg font-semibold tabular-nums">{fmt(difference)}</dd>
        </div>
      </dl>
    </section>
  )
}
