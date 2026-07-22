import { useLocale, useTranslations } from "next-intl"

import type { FinancialHealth } from "@/lib/dashboard/financial-health"
import type { NetWorth } from "@/lib/dashboard/net-worth"
import { computeRunwayMonths } from "@/lib/dashboard/net-worth"
import { currencyFormatter } from "@/lib/format/currency"
import { percentFormatter } from "@/lib/format/percent"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The dashboard's Financial health section (ADR-0016): the household's profit/savings trend plus
 * runway. The profit figures (savings rate, typical monthly saving, profit streak) appear with
 * enough completed-cycle history; runway appears once a Net worth exists. Net worth itself and the
 * balance-entry form live in the Holdings section (plan 007 slice 3). Figures come from the pure
 * {@link FinancialHealth} / {@link NetWorth} view-models.
 */
export function FinancialHealthSection({
  health,
  netWorth,
  currency,
  className,
}: {
  health: FinancialHealth
  netWorth: NetWorth | null
  currency: string
  className?: string
}) {
  const t = useTranslations("dashboard.financialHealth")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const money = currencyFormatter(currency, locale)
  const percent = percentFormatter(locale)

  const { hasEnoughHistory, savingsRate, avgMonthlySaving, profitableCount, streakConsidered } =
    health
  const runwayMonths = netWorth ? computeRunwayMonths(netWorth.total, health.monthlyBurn) : null

  const cell =
    "flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @sm:px-4 @sm:py-0 @sm:first:pl-0 @sm:last:pr-0"

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
            <div className={cell}>
              <dt className="truncate text-sm text-muted-foreground">{t("savingsRate")}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {savingsRate === null ? "—" : percent.format(savingsRate)}
              </dd>
            </div>
            <div className={cell}>
              <dt className="truncate text-sm text-muted-foreground">{t("typicalSaving")}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {avgMonthlySaving === null ? "—" : money.format(avgMonthlySaving)}
              </dd>
            </div>
            <div className={cell}>
              <dt className="truncate text-sm text-muted-foreground">{t("profitStreak")}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {t("profitStreakValue", { count: profitableCount, total: streakConsidered })}
              </dd>
            </div>
          </dl>

          {/* The benchmark contextualises the savings rate, so it only shows when there is one. */}
          {savingsRate !== null && (
            <p className="text-sm text-pretty text-muted-foreground">{t("savingsRateBenchmark")}</p>
          )}
        </>
      )}

      {/* Runway (ADR-0016): months Net worth covers the monthly burn if income stopped. Net worth
          itself and the balance-entry form live in the Holdings section (plan 007); runway stays
          here as a survival signal beside the profit/savings figures. */}
      {runwayMonths !== null && (
        <div className="flex flex-col gap-1 border-t border-border pt-6">
          <span className="text-sm text-muted-foreground">{t("runway")}</span>
          <span className="text-2xl font-semibold tabular-nums">
            {t("runwayValue", { months: runwayMonths })}
          </span>
          <span className="text-sm text-muted-foreground">{t("runwayCaption")}</span>
        </div>
      )}
    </section>
  )
}
