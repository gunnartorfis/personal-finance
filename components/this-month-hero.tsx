import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { cycleKeyLabel } from "@/lib/dashboard/cycle"
import type { DashboardHero } from "@/lib/dashboard/dashboard-view"
import { cn } from "@/lib/utils"

/**
 * The dashboard's current-cycle headline (Phase K, K10). Spending is the hero (ADR-0008): the big
 * number is what's been spent so far this month, with a linear month-end projection beneath it.
 * Money in and Difference are secondary. Two neutral, never-alarming info lines add context — how the
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
  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)

  const { month, spentSoFar, projected, moneyIn, difference, vsAveragePct, trailingAverage, largestCharge } =
    hero
  const hasInfo = vsAveragePct !== null || largestCharge !== null

  return (
    <section className={cn("@container flex flex-col gap-6 rounded-xl border border-border bg-card p-6", className)}>
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-medium">{cycleKeyLabel(month)}</h2>
        <span className="text-sm text-muted-foreground">This month</span>
      </header>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Spending so far</span>
        <span className="text-3xl font-semibold tabular-nums">{fmt(spentSoFar)}</span>
        {projected !== null && (
          <span className="text-sm text-muted-foreground">Projected {fmt(projected)} by month end.</span>
        )}
      </div>

      {hasInfo && (
        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {vsAveragePct !== null && (
            <p className="flex items-center gap-1.5">
              {vsAveragePct >= 0 ? (
                <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
              ) : (
                <ArrowDownRight aria-hidden="true" className="size-4 shrink-0" />
              )}
              <span>
                Last full month ran {vsAveragePct >= 0 ? "+" : ""}
                {vsAveragePct}% vs your average
                {trailingAverage !== null ? ` of ${fmt(trailingAverage)}` : ""}.
              </span>
            </p>
          )}
          {largestCharge !== null && (
            <p>
              Largest charge this month: {largestCharge.merchant} · {fmt(largestCharge.amount)}.
            </p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-1 divide-y divide-border @xs:grid-cols-2 @xs:divide-x @xs:divide-y-0">
        <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @xs:px-4 @xs:py-0 @xs:first:pl-0 @xs:last:pr-0">
          <dt className="truncate text-sm text-muted-foreground">Money in</dt>
          <dd className="text-lg font-semibold tabular-nums">{fmt(moneyIn)}</dd>
        </div>
        <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @xs:px-4 @xs:py-0 @xs:first:pl-0 @xs:last:pr-0">
          <dt className="truncate text-sm text-muted-foreground">Difference</dt>
          <dd className="text-lg font-semibold tabular-nums">{fmt(difference)}</dd>
        </div>
      </dl>
    </section>
  )
}
