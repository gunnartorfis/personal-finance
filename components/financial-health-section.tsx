import { useLocale, useTranslations } from "next-intl"

import type { FinancialHealth } from "@/lib/dashboard/financial-health"
import { currencyFormatter } from "@/lib/format/currency"
import { percentFormatter } from "@/lib/format/percent"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The dashboard's Financial health section (ADR-0016): the household's profit/savings trend at a
 * glance — savings rate as a share of income (against a healthy-target benchmark), typical monthly
 * saving, and a profit streak. All figures are trailing, completed-cycle averages from the pure
 * {@link FinancialHealth} view-model, so a single month never defines them. Until there are enough
 * completed cycles, a neutral thin-data line stands in. Pure and prop-driven, mirroring
 * {@link import("./this-month-hero").ThisMonthHero}.
 */
export function FinancialHealthSection({
  health,
  currency,
  className,
}: {
  health: FinancialHealth
  currency: string
  className?: string
}) {
  const t = useTranslations("dashboard.financialHealth")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const money = currencyFormatter(currency, locale)
  const percent = percentFormatter(locale)

  const { hasEnoughHistory, savingsRate, avgMonthlySaving, profitableCount, streakConsidered } =
    health

  return (
    <section
      className={cn(
        "@container flex flex-col gap-6 rounded-xl border border-border bg-card p-6",
        className
      )}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("subtitle")}</p>
      </header>

      {!hasEnoughHistory ? (
        <p className="text-sm text-pretty text-muted-foreground">{t("notEnoughData")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-1 divide-y divide-border @sm:grid-cols-3 @sm:divide-x @sm:divide-y-0">
            <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @sm:px-4 @sm:py-0 @sm:first:pl-0 @sm:last:pr-0">
              <dt className="truncate text-sm text-muted-foreground">{t("savingsRate")}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {savingsRate === null ? "—" : percent.format(savingsRate)}
              </dd>
            </div>
            <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @sm:px-4 @sm:py-0 @sm:first:pl-0 @sm:last:pr-0">
              <dt className="truncate text-sm text-muted-foreground">{t("typicalSaving")}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {money.format(avgMonthlySaving ?? 0)}
              </dd>
            </div>
            <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @sm:px-4 @sm:py-0 @sm:first:pl-0 @sm:last:pr-0">
              <dt className="truncate text-sm text-muted-foreground">{t("profitStreak")}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {t("profitStreakValue", { count: profitableCount, total: streakConsidered })}
              </dd>
            </div>
          </dl>

          <p className="text-sm text-pretty text-muted-foreground">{t("savingsRateBenchmark")}</p>
        </>
      )}
    </section>
  )
}
