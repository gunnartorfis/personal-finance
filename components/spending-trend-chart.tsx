import { useTranslations } from "next-intl"
import Link from "next/link"

import { currencyFormatter } from "@/lib/format/currency"
import { formatCycleMonth } from "@/lib/format/date"
import type { MonthlySpendPoint } from "@/lib/dashboard/monthly-series"
import { DEFAULT_TRAILING } from "@/lib/dashboard/spending-trend"
import type { Locale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * Bottom offset for the income marker. Clamped so the 2px line stays inside the overflow-hidden
 * track even when income is the chart's ceiling — a bare `100%` would push it entirely above the
 * top edge and clip it to nothing.
 */
export function incomeLineBottom(moneyPct: number): string {
  return `min(${moneyPct}%, calc(100% - 2px))`
}

/**
 * The rolling 12-month spending trend (Phase K, K11). Lightweight CSS/SVG-free bars — spending as the
 * bar height with a income overlay line — so it carries no chart dependency. Each bar links to that
 * cycle on the transactions view. Below {@link DEFAULT_TRAILING.minMonths} months of history it shows
 * a keep-uploading placeholder instead of a near-empty chart (progressive thin-data). Prop-driven off
 * the view-model's `series` + history flags.
 */
export function SpendingTrendChart({
  series,
  hasEnoughHistory,
  completedMonths,
  currency,
  locale,
  className,
}: {
  series: MonthlySpendPoint[]
  hasEnoughHistory: boolean
  completedMonths: number
  currency: string
  locale: Locale
  className?: string
}) {
  const t = useTranslations("dashboard.trend")
  const money = currencyFormatter(currency, locale)
  const fmt = (amount: number) => money.format(amount)

  // Scale to the largest single value (spending or income) so both fit; floor at 1 to avoid /0.
  const maxValue = Math.max(1, ...series.map((point) => Math.max(point.spending, point.income)))

  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}>
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-base font-medium">{t("title")}</h2>
        {hasEnoughHistory && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-sm bg-foreground/80" />
              {t("spending")}
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0.5 w-3 rounded-full bg-emerald-500" />
              {t("income")}
            </span>
          </div>
        )}
      </header>

      {hasEnoughHistory ? (
        <div className="flex items-end gap-1.5 overflow-x-auto">
          {series.map((point) => {
            const spendPct = (point.spending / maxValue) * 100
            const moneyPct = (point.income / maxValue) * 100
            return (
              <Link
                key={point.month}
                href={`/transactions?cycle=${point.month}`}
                aria-label={t("barLabel", {
                  month: formatCycleMonth(point.month, locale),
                  spent: fmt(point.spending),
                  income: fmt(point.income),
                })}
                title={t("barTitle", {
                  month: formatCycleMonth(point.month, locale),
                  spent: fmt(point.spending),
                })}
                className="group flex min-w-8 flex-1 flex-col items-center gap-1.5"
              >
                <span
                  aria-hidden="true"
                  className="relative h-32 w-full overflow-hidden rounded-sm bg-muted"
                >
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-sm bg-foreground/80 group-hover:bg-foreground"
                    style={{ height: `${spendPct}%` }}
                  />
                  {point.income > 0 && (
                    <span
                      className="absolute inset-x-0 h-0.5 bg-emerald-500"
                      style={{ bottom: incomeLineBottom(moneyPct) }}
                    />
                  )}
                </span>
                <span aria-hidden="true" className="text-[10px] tabular-nums text-muted-foreground">
                  {formatCycleMonth(point.month, locale, { short: true })}
                </span>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg bg-muted px-4 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t("notEnough")}</p>
          <p>
            {t("keepUploading", {
              completed: completedMonths,
              min: DEFAULT_TRAILING.minMonths,
            })}
          </p>
        </div>
      )}
    </section>
  )
}
