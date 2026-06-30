import type { NetSummary } from "@/lib/dashboard/net-summary"
import { cn } from "@/lib/utils"

/**
 * Presentational net profit/loss card for a statement cycle (Phase F). Pure and prop-driven so it
 * renders on the server and is easy to test; the data is loaded by the dashboard page.
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

  const categories = [
    { label: "Fixed", amount: summary.byExpenseType.Fixed },
    { label: "Necessary", amount: summary.byExpenseType.Necessary },
    { label: "Nice to have", amount: summary.byExpenseType["Nice to have"] },
  ]
  if (summary.byExpenseType[""] !== 0) {
    categories.push({ label: "Other", amount: summary.byExpenseType[""] })
  }
  if (summary.unclassified !== 0) {
    categories.push({ label: "Unclassified", amount: summary.unclassified })
  }

  return (
    <section className="flex flex-col gap-6 rounded-xl border border-border p-6">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">{cycleLabel}</h2>
        <span className="text-sm text-muted-foreground">Statement cycle</span>
      </header>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{isProfit ? "Net profit" : "Net loss"}</span>
        <span
          className={cn(
            "text-3xl font-semibold tabular-nums",
            isProfit ? "text-emerald-600" : "text-destructive",
          )}
        >
          {fmt(summary.net)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div className="flex flex-col">
          <dt className="text-muted-foreground">Income</dt>
          <dd className="font-medium tabular-nums">{fmt(summary.income)}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted-foreground">Expenses</dt>
          {/* Magnitude, matching the breakdown rows — direction is conveyed by the label and net. */}
          <dd className="font-medium tabular-nums">{fmt(Math.abs(summary.expense))}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Spending by type</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {categories.map((category) => (
            <li key={category.label} className="flex items-center justify-between">
              <span className="text-muted-foreground">{category.label}</span>
              <span className="tabular-nums">{fmt(Math.abs(category.amount))}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
