import { useLocale, useTranslations } from "next-intl"

import { BalanceEntryForm } from "@/components/balance-entry-form"
import type { FinancialHealth } from "@/lib/dashboard/financial-health"
import type { AccountBalance, NetWorth } from "@/lib/dashboard/net-worth"
import { computeRunwayMonths } from "@/lib/dashboard/net-worth"
import { currencyFormatter } from "@/lib/format/currency"
import { formatDate } from "@/lib/format/date"
import { percentFormatter } from "@/lib/format/percent"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The dashboard's Financial health section (ADR-0016): the household's profit/savings trend and, once
 * a balance exists, its net worth and runway. Two halves that degrade independently — the profit
 * figures (savings rate, typical monthly saving, profit streak) appear with enough completed-cycle
 * history; net worth + runway appear once any Account balance is recorded, with an inline entry form.
 * Trailing figures come from the pure {@link FinancialHealth} / {@link NetWorth} view-models.
 */
export function FinancialHealthSection({
  health,
  netWorth,
  accounts,
  currency,
  className,
}: {
  health: FinancialHealth
  netWorth: NetWorth | null
  accounts: AccountBalance[]
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

      {/* Net worth + runway (ADR-0016): a distinct sibling half, so a subtle top border separates it
          from the profit/savings figures. Shown only when the Household has Accounts to value. */}
      {accounts.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-border pt-6">
          {netWorth ? (
            <dl className="grid grid-cols-1 divide-y divide-border @sm:grid-cols-2 @sm:divide-x @sm:divide-y-0">
              <div className={cell}>
                <dt className="truncate text-sm text-muted-foreground">{t("netWorth")}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{money.format(netWorth.total)}</dd>
                <p className="text-sm text-muted-foreground">
                  {/* UTC-anchored so SSR and client render the same day and a midnight-UTC snapshot
                      never slips to the previous date west of UTC (cf. formatCycleMonth). */}
                  {t("asOf", {
                    date: formatDate(netWorth.asOf, locale, { dateStyle: "medium", timeZone: "UTC" }),
                  })}
                </p>
              </div>
              {runwayMonths !== null && (
                <div className={cell}>
                  <dt className="truncate text-sm text-muted-foreground">{t("runway")}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {t("runwayValue", { months: runwayMonths })}
                  </dd>
                  <p className="text-sm text-muted-foreground">{t("runwayCaption")}</p>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-pretty text-muted-foreground">{t("addBalancesPrompt")}</p>
          )}

          <BalanceEntryForm accounts={accounts} />
        </div>
      )}
    </section>
  )
}
