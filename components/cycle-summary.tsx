import type { CSSProperties } from "react"

import type { NetSummary } from "@/lib/dashboard/net-summary"
import { cn } from "@/lib/utils"

/**
 * Spending categories in display order, each with the swatch colour used in both the proportion bar
 * and its legend dot. The three real expense types get distinct hues; the unbucketed (`""`) and
 * not-yet-classified totals share a neutral so the eye reads them as "no category".
 */
const CATEGORIES = [
  { key: "Fixed", label: "Fixed", swatch: "bg-emerald-500" },
  { key: "Necessary", label: "Necessary", swatch: "bg-amber-500" },
  { key: "Nice to have", label: "Nice to have", swatch: "bg-rose-500" },
  { key: "Other", label: "Other", swatch: "bg-zinc-400 dark:bg-zinc-500" },
  {
    key: "Unclassified",
    label: "Unclassified",
    swatch: "bg-zinc-300 dark:bg-zinc-700",
  },
] as const

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

  const breakdown = CATEGORIES.map((category) => {
    const magnitude = Math.abs(
      category.key === "Other"
        ? summary.byExpenseType[""]
        : category.key === "Unclassified"
          ? summary.unclassified
          : summary.byExpenseType[category.key]
    )
    return { ...category, magnitude }
  }).filter((category) => category.magnitude > 0)

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

      {totalExpense > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium">Spending by type</h2>
            <p className="text-sm text-muted-foreground tabular-nums">
              {fmt(totalExpense)} total
            </p>
          </div>

          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {breakdown.map((category) => (
              <div
                key={category.key}
                className={cn("h-full w-(--share)", category.swatch)}
                style={
                  {
                    "--share": `${(category.magnitude / totalExpense) * 100}%`,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <ul role="list" className="flex flex-col gap-2">
            {breakdown.map((category) => (
              <li
                key={category.key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      category.swatch
                    )}
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground">
                    {category.label}
                  </span>
                </span>
                <span className="tabular-nums">{fmt(category.magnitude)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
