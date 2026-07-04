import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { PeriodSelector, type PeriodOption } from "@/components/period-selector"
import type { DashboardHero } from "@/lib/dashboard/dashboard-view"
import { currencyFormatter } from "@/lib/format/currency"
import { formatCycleMonth } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The dashboard's headline for the selected cycle (Phase K, K10). Spending is the hero (ADR-0008):
 * the big number is what's been spent — so far this month for the in-progress current cycle (with a
 * linear month-end projection beneath it), or the final total for a past month. Income and
 * Difference are secondary. Two neutral, never-alarming info lines add context — how the month
 * compares to the trailing average, and its largest single charge.
 *
 * When `options`/`selected` are supplied the header carries a {@link PeriodSelector} so the user can
 * step back through previous months (driven by `?cycle=` on `/dashboard`); without them it falls
 * back to a static month heading. Pure and prop-driven off the view-model's {@link DashboardHero}.
 */
export function ThisMonthHero({
  hero,
  currency,
  options,
  selected,
  className,
}: {
  hero: DashboardHero
  currency: string
  /** Selectable cycles, newest-first; when set, the header renders a period selector. */
  options?: PeriodOption[]
  /** The selected cycle key that drives the selector. */
  selected?: string
  className?: string
}) {
  const t = useTranslations("dashboard")
  const locale = toLocale(useLocale()) ?? defaultLocale
  // One formatter instance, reused across the card (not re-created per value).
  const money = currencyFormatter(currency, locale)
  const fmt = (amount: number) => money.format(amount)

  const {
    month,
    isCurrent,
    spentSoFar,
    projected,
    income,
    difference,
    vsAveragePct,
    trailingAverage,
    largestCharge,
  } = hero
  const hasInfo = vsAveragePct !== null || largestCharge !== null
  // Direction cue: up only when above average, down when below, flat at exactly the average.
  const TrendIcon = vsAveragePct === null || vsAveragePct === 0 ? Minus : vsAveragePct > 0 ? ArrowUpRight : ArrowDownRight
  const deltaLabel = vsAveragePct === null ? "" : `${vsAveragePct > 0 ? "+" : ""}${vsAveragePct}%`

  return (
    <section className={cn("@container flex flex-col gap-6 rounded-xl border border-border bg-card p-6", className)}>
      <header className="flex items-center justify-between gap-4">
        {options && selected ? (
          <>
            {/* The selector labels the visible month; keep a heading in the outline for a11y. */}
            <h2 className="sr-only">{formatCycleMonth(month, locale)}</h2>
            <PeriodSelector options={options} selected={selected} basePath="/dashboard" />
          </>
        ) : (
          <h2 className="text-base font-medium">{formatCycleMonth(month, locale)}</h2>
        )}
        {/* The "This month" tag only fits the live cycle; a past month is named by the selector. */}
        {isCurrent && <span className="text-sm text-muted-foreground">{t("thisMonth")}</span>}
      </header>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">
          {isCurrent ? t("spendingSoFar") : t("spentTotal")}
        </span>
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
                {isCurrent
                  ? trailingAverage !== null
                    ? t("vsAverageWithAvg", { delta: deltaLabel, average: fmt(trailingAverage) })
                    : t("vsAverage", { delta: deltaLabel })
                  : /* Past months always carry a trailing average when vsAveragePct is set:
                       compareCycleToAverage returns both together (see spending-trend). */
                    t("monthVsAverageWithAvg", { delta: deltaLabel, average: fmt(trailingAverage ?? 0) })}
              </span>
            </p>
          )}
          {largestCharge !== null && (
            <p>
              {t(isCurrent ? "largestCharge" : "largestChargeSelected", {
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
