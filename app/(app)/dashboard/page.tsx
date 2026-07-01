import { AccountBreakdown } from "@/components/account-breakdown"
import { ActionBand } from "@/components/action-band"
import { BiggestMovers } from "@/components/biggest-movers"
import { CategoryMixModule } from "@/components/category-mix-module"
import { SpendingTrendChart } from "@/components/spending-trend-chart"
import { ThisMonthHero } from "@/components/this-month-hero"
import { TopMerchants } from "@/components/top-merchants"
import { loadDashboardView } from "@/lib/dashboard/dashboard-view"
import { requireHousehold } from "@/lib/household/current"
import { cn } from "@/lib/utils"

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

  const hasMerchants = view.modules.topMerchants.length > 0
  const hasMovers =
    view.modules.movers.merchants.length > 0 || view.modules.movers.categories.length > 0

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
      {/* The two compact list modules sit side by side on wider screens to break up the stack;
          same gap as the outer column so their edges line up with the full-width modules. The
          pairing mirrors the modules' own empty gating: two columns only when both render, and
          no wrapper at all when neither does (an empty grid would double the column gap). */}
      {(hasMerchants || hasMovers) && (
        <div
          className={cn("grid items-start gap-6", hasMerchants && hasMovers && "sm:grid-cols-2")}
        >
          <TopMerchants merchants={view.modules.topMerchants} currency={billingCurrency} />
          <BiggestMovers movers={view.modules.movers} currency={billingCurrency} />
        </div>
      )}
      <AccountBreakdown accounts={view.modules.accounts} currency={billingCurrency} />
    </div>
  )
}
