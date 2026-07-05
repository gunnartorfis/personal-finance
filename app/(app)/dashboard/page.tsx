import { AccountBreakdown } from "@/components/account-breakdown"
import { ActionBand } from "@/components/action-band"
import { BiggestMovers } from "@/components/biggest-movers"
import { CategoryMixModule } from "@/components/category-mix-module"
import { FinancialHealthSection } from "@/components/financial-health-section"
import { BalanceChecks } from "@/components/balance-checks"
import { BudgetEnvelopes } from "@/components/budget-envelopes"
import { NetWorthProjectionChart } from "@/components/net-worth-projection-chart"
import { RecurringSubscriptions } from "@/components/recurring-subscriptions"
import { SavingsProgressCard } from "@/components/savings-progress-card"
import { SpendingTrendChart } from "@/components/spending-trend-chart"
import { getTranslations } from "next-intl/server"

import { ThisMonthHero } from "@/components/this-month-hero"
import { TopMerchants } from "@/components/top-merchants"
import { type PeriodOption } from "@/components/period-selector"
import { projectCashFlow } from "@/lib/dashboard/cash-flow"
import { loadBalanceChecks } from "@/lib/dashboard/balance-check"
import { currentCycleKey, isValidCycleKey, recentCycleKeys } from "@/lib/dashboard/cycle"
import { loadDashboardView } from "@/lib/dashboard/dashboard-view"
import { loadNetWorthPanel, projectNetWorth } from "@/lib/dashboard/net-worth"
import { loadSavingsProgress } from "@/lib/savings/assessment"
import { formatCycleMonth } from "@/lib/format/date"
import { requireHousehold } from "@/lib/household/current"
import { resolveRequestLocale } from "@/lib/i18n/locale"
import { cn } from "@/lib/utils"

/** Months of history the hero can step back through — matches {@link loadDashboardView}'s window. */
const HERO_MONTHS = 12

// Auth- and tenant-scoped, per-request data: always render dynamically (no static prerender).
export const dynamic = "force-dynamic"

/**
 * The dashboard (Phase K, ADR-0008): the Household's finances at a glance. A top action band surfaces
 * anything that needs attention, then the current-cycle spending hero, then the rolling over-time
 * modules — spending trend, category mix, top merchants, biggest movers, and (for multi-account
 * households) the account split. Each module is prop-driven off {@link loadDashboardView}, which
 * gates the thin-data cases. `requireHousehold` enforces the tenant guard (redirecting to sign-in),
 * so this page is always rendered dynamically.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>
}) {
  const [{ repo, plan, billingCurrency }, locale, t] = await Promise.all([
    requireHousehold(),
    resolveRequestLocale(),
    getTranslations("dashboard"),
  ])
  const now = new Date()
  const current = currentCycleKey(now)

  // The hero can view any month in its rolling window (`?cycle=YYYY-MM`, shareable and refresh-safe);
  // anything outside the window falls back to the current month so the shown figures always exist in
  // the loaded series. Only the hero re-scopes — every other module stays on the live data.
  const windowKeys = recentCycleKeys(now, HERO_MONTHS)
  const { cycle } = await searchParams
  const selected =
    cycle && isValidCycleKey(cycle) && windowKeys.includes(cycle) ? cycle : current

  const [view, savingsProgress, netWorthPanel, balanceChecks] = await Promise.all([
    loadDashboardView(repo, now, { plan, count: HERO_MONTHS, selectedKey: selected }),
    loadSavingsProgress(repo, now),
    loadNetWorthPanel(repo),
    loadBalanceChecks(repo),
  ])

  // Offer months with any activity, plus always the current and selected month, so the picker never
  // hides where the user is yet stays free of empty pre-history months. Keys sort lexicographically
  // the same as chronologically; newest-first for the selector.
  const monthsWithData = new Set<string>()
  for (const p of view.modules.series) {
    if (p.spending > 0 || p.income > 0) monthsWithData.add(p.month)
  }
  const monthOptions: PeriodOption[] = windowKeys
    .filter((key) => key === current || key === selected || monthsWithData.has(key))
    .reverse()
    .map((key) => ({ key, label: formatCycleMonth(key, locale) }))

  const hasMerchants = view.modules.topMerchants.length > 0
  const hasMovers =
    view.modules.movers.merchants.length > 0 || view.modules.movers.categories.length > 0

  // Project net worth 12 months out only when both inputs exist: a current net worth (a balance is
  // recorded) and a typical monthly saving (enough completed-cycle history). No extra query — both
  // come from data already loaded above.
  const PROJECTION_MONTHS = 12
  const projection =
    netWorthPanel.netWorth && view.financialHealth.avgMonthlySaving !== null
      ? projectNetWorth({
          startingNetWorth: netWorthPanel.netWorth.total,
          monthlySaving: view.financialHealth.avgMonthlySaving,
          startCycle: currentCycleKey(now),
          months: PROJECTION_MONTHS,
        })
      : null
  // The cash-flow forecast (#103) reuses the same typical monthly net; we surface just its horizon
  // total on the projection card (the balance line itself is the net-worth projection).
  const cashFlowHorizonNet =
    view.financialHealth.avgMonthlySaving !== null
      ? projectCashFlow({
          startingBalance: netWorthPanel.netWorth?.total ?? 0,
          monthlyNet: view.financialHealth.avgMonthlySaving,
          startCycle: currentCycleKey(now),
          months: PROJECTION_MONTHS,
        }).horizonNet
      : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-pretty text-muted-foreground">{t("subtitle")}</p>
      </header>

      <ActionBand actionBand={view.actionBand} />
      <ThisMonthHero
        hero={view.hero}
        currency={billingCurrency}
        options={monthOptions}
        selected={selected}
      />

      <SavingsProgressCard progress={savingsProgress} locale={locale} />

      <FinancialHealthSection
        health={view.financialHealth}
        netWorth={netWorthPanel.netWorth}
        accounts={netWorthPanel.accounts}
        currency={billingCurrency}
      />

      <BalanceChecks checks={balanceChecks} currency={billingCurrency} locale={locale} />

      {projection && (
        <NetWorthProjectionChart
          points={projection}
          currency={billingCurrency}
          horizonNet={cashFlowHorizonNet}
          horizonMonths={PROJECTION_MONTHS}
        />
      )}

      <SpendingTrendChart
        series={view.modules.series}
        hasEnoughHistory={view.modules.hasEnoughHistory}
        completedMonths={view.modules.completedMonths}
        currency={billingCurrency}
      />
      <CategoryMixModule
        categoryTrend={view.modules.categoryTrend}
        series={view.modules.series}
        currentMonth={current}
        mostlyUnclassified={view.modules.categoryMostlyUnclassified}
        currency={billingCurrency}
      />
      {/* The two compact list modules sit side by side on wider screens to break up the stack;
          same gap as the outer column so their edges line up with the full-width modules. The
          pairing mirrors the modules' own empty gating: two columns only when both render, and
          no wrapper at all when neither does (an empty grid would double the column gap). */}
      {(hasMerchants || hasMovers) && (
        <div
          className={cn("grid items-start gap-6", hasMerchants && hasMovers && "sm:grid-cols-2")}
        >
          <TopMerchants
            merchants={view.modules.topMerchants}
            currency={billingCurrency}
            locale={locale}
          />
          <BiggestMovers
            movers={view.modules.movers}
            currency={billingCurrency}
            locale={locale}
          />
        </div>
      )}
      <BudgetEnvelopes
        status={view.modules.budgetStatus}
        currency={billingCurrency}
        locale={locale}
      />
      <RecurringSubscriptions
        recurring={view.modules.recurring}
        currency={billingCurrency}
        locale={locale}
      />
      <AccountBreakdown
        accounts={view.modules.accounts}
        currency={billingCurrency}
        locale={locale}
      />
    </div>
  )
}
