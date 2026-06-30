import { SpendingByType } from "@/components/spending-by-type"
import type { NetSummary } from "@/lib/dashboard/net-summary"
import { cn } from "@/lib/utils"

/**
 * Presentational net profit/loss card for a statement cycle (Phase F). Pure and prop-driven so it
 * renders on the server and is easy to test; the data is loaded by the dashboard page. Shares the
 * spending-by-type proportion bar with the transactions overview via {@link SpendingByType} so the
 * two surfaces read identically.
 */
export function NetSummaryCard({
  summary,
  currency,
  cycleLabel,
}: {
  summary: NetSummary
  currency: string
  cycleLabel: string
}) {
  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)

  const isProfit = summary.net >= 0

  return (
    <section className="@container flex flex-col gap-6 rounded-xl border border-border bg-card p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-medium">{cycleLabel}</h2>
        <span className="text-sm text-muted-foreground">Statement cycle</span>
      </header>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">
          {isProfit ? "Net profit" : "Net loss"}
        </span>
        <span
          className={cn(
            "text-3xl font-semibold tabular-nums",
            isProfit ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"
          )}
        >
          {fmt(summary.net)}
        </span>
      </div>

      <dl className="grid grid-cols-1 divide-y divide-border @xs:grid-cols-2 @xs:divide-x @xs:divide-y-0">
        <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @xs:px-4 @xs:py-0 @xs:first:pl-0 @xs:last:pr-0">
          <dt className="truncate text-sm text-muted-foreground">Income</dt>
          <dd className="text-lg font-semibold tabular-nums">{fmt(summary.income)}</dd>
        </div>
        <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @xs:px-4 @xs:py-0 @xs:first:pl-0 @xs:last:pr-0">
          <dt className="truncate text-sm text-muted-foreground">Expenses</dt>
          {/* Magnitude, matching the breakdown rows — direction is conveyed by the label and net. */}
          <dd className="text-lg font-semibold tabular-nums">{fmt(Math.abs(summary.expense))}</dd>
        </div>
      </dl>

      <SpendingByType summary={summary} currency={currency} headingLevel={3} />
    </section>
  )
}
