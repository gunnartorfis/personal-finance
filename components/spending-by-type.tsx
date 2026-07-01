import type { CSSProperties } from "react"

import type { NetSummary } from "@/lib/dashboard/net-summary"
import { cn } from "@/lib/utils"

/**
 * Spending categories in display order, each with the swatch colour used in both the proportion bar
 * and its legend dot. The three real expense types get distinct hues; the unbucketed (`""`) and
 * not-yet-classified totals share a neutral so the eye reads them as "no category".
 */
export const CATEGORIES = [
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
 * Spending-by-type breakdown shared by the transactions period overview ({@link CycleSummary}) and
 * the dashboard net card ({@link NetSummaryCard}) so both surfaces read identically: a proportion
 * bar over a colour-keyed legend. Pure and prop-driven; renders nothing when there is no expense.
 * Amounts come in signed and are shown as magnitudes. `headingLevel` lets each caller slot the
 * "Spending by type" heading at the right depth in its surrounding hierarchy.
 */
export function SpendingByType({
  summary,
  currency,
  headingLevel = 2,
  className,
}: {
  summary: NetSummary
  currency: string
  headingLevel?: 2 | 3
  className?: string
}) {
  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)

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

  if (totalExpense <= 0) return null

  const Heading = headingLevel === 3 ? "h3" : "h2"

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <Heading className="text-sm font-medium">Spending by type</Heading>
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
                className={cn("size-2 shrink-0 rounded-full", category.swatch)}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{category.label}</span>
            </span>
            <span className="tabular-nums">{fmt(category.magnitude)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
