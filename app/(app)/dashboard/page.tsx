import { AccountBreakdown } from "@/components/account-breakdown"
import { ActionBand } from "@/components/action-band"
import { BiggestMovers } from "@/components/biggest-movers"
import { CategoryMixModule } from "@/components/category-mix-module"
import { SpendingTrendChart } from "@/components/spending-trend-chart"
import { ThisMonthHero } from "@/components/this-month-hero"
import { TopMerchants } from "@/components/top-merchants"
import { loadDashboardView } from "@/lib/dashboard/dashboard-view"
import { requireHousehold } from "@/lib/household/current"

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
export default async function DashboardPage() {
  const { repo, plan, billingCurrency } = await requireHousehold()
  const view = await loadDashboardView(repo, new Date(), { plan })

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Your household&apos;s spending at a glance.
        </p>
      </header>

      <ActionBand actionBand={view.actionBand} />
      <ThisMonthHero hero={view.hero} currency={billingCurrency} />

      {/* Slot: the savings-goal progress card (separate Phase J work) belongs here, above the trend. */}

      <SpendingTrendChart
        series={view.modules.series}
        hasEnoughHistory={view.modules.hasEnoughHistory}
        completedMonths={view.modules.completedMonths}
        currency={billingCurrency}
      />
      <CategoryMixModule
        categoryTrend={view.modules.categoryTrend}
        currentMonth={view.hero.month}
        mostlyUnclassified={view.modules.categoryMostlyUnclassified}
        currency={billingCurrency}
      />
      <TopMerchants merchants={view.modules.topMerchants} currency={billingCurrency} />
      <BiggestMovers movers={view.modules.movers} currency={billingCurrency} />
      <AccountBreakdown accounts={view.modules.accounts} currency={billingCurrency} />
    </div>
  )
}
