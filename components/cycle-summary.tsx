import { SpendingByType } from "@/components/spending-by-type"
import type { NetSummary } from "@/lib/dashboard/net-summary"
import { cn } from "@/lib/utils"

/**
 * Period overview for the transactions view: an income / expenses / net stat strip over a
 * spending-by-type proportion bar. Pure and prop-driven (the page loads the {@link NetSummary}), so
 * it renders on the server. Amounts come in signed; everything but net is shown as a magnitude,
 * with direction carried by the labels.
 */
export function CycleSummary({
  summary,
  currency,
  className,
}: {
  summary: NetSummary
  currency: string
  className?: string
}) {
  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)

  const isProfit = summary.net >= 0
  const totalExpense = Math.abs(summary.expense)

  return (
    <section className={cn("@container flex flex-col gap-6", className)}>
      <dl className="grid grid-cols-1 divide-y divide-border @md:grid-cols-3 @md:divide-x @md:divide-y-0">
        <div className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 @md:px-6 @md:py-0 @md:first:pl-0 @md:last:pr-0">
          <dt className="truncate text-sm text-muted-foreground">Income</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {fmt(summary.income)}
          </dd>
        </div>
        <div className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 @md:px-6 @md:py-0 @md:first:pl-0 @md:last:pr-0">
          <dt className="truncate text-sm text-muted-foreground">Expenses</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {fmt(totalExpense)}
          </dd>
        </div>
        <div className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 @md:px-6 @md:py-0 @md:first:pl-0 @md:last:pr-0">
          <dt className="truncate text-sm text-muted-foreground">
            {isProfit ? "Net profit" : "Net loss"}
          </dt>
          <dd
            className={cn(
              "text-xl font-semibold tabular-nums",
              isProfit
                ? "text-emerald-600 dark:text-emerald-500"
                : "text-destructive"
            )}
          >
            {fmt(summary.net)}
          </dd>
        </div>
      </dl>

      <SpendingByType summary={summary} currency={currency} />
    </section>
  )
}
