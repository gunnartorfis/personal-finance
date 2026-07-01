import Link from "next/link"

import { cycleKeyLabel } from "@/lib/dashboard/cycle"
import type { MonthlySpendPoint } from "@/lib/dashboard/monthly-series"
import { DEFAULT_TRAILING } from "@/lib/dashboard/spending-trend"
import { cn } from "@/lib/utils"

/**
 * Bottom offset for the money-in marker. Clamped so the 2px line stays inside the overflow-hidden
 * track even when money in is the chart's ceiling — a bare `100%` would push it entirely above the
 * top edge and clip it to nothing.
 */
export function moneyInLineBottom(moneyPct: number): string {
  return `min(${moneyPct}%, calc(100% - 2px))`
}

/** Short month label for a `YYYY-MM` key, e.g. "Mar". */
function shortMonth(key: string): string {
  const [year, month] = key.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  )
}

/**
 * The rolling 12-month spending trend (Phase K, K11). Lightweight CSS/SVG-free bars — spending as the
 * bar height with a money-in overlay line — so it carries no chart dependency. Each bar links to that
 * cycle on the transactions view. Below {@link DEFAULT_TRAILING.minMonths} months of history it shows
 * a keep-uploading placeholder instead of a near-empty chart (progressive thin-data). Prop-driven off
 * the view-model's `series` + history flags.
 */
export function SpendingTrendChart({
  series,
  hasEnoughHistory,
  completedMonths,
  currency,
  className,
}: {
  series: MonthlySpendPoint[]
  hasEnoughHistory: boolean
  completedMonths: number
  currency: string
  className?: string
}) {
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })
  const fmt = (amount: number) => money.format(amount)

  // Scale to the largest single value (spending or money in) so both fit; floor at 1 to avoid /0.
  const maxValue = Math.max(1, ...series.map((point) => Math.max(point.spending, point.moneyIn)))

  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}>
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-base font-medium">Spending trend</h2>
        {hasEnoughHistory && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-sm bg-foreground/80" />
              Spending
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0.5 w-3 rounded-full bg-emerald-500" />
              Money in
            </span>
          </div>
        )}
      </header>

      {hasEnoughHistory ? (
        <div className="flex items-end gap-1.5 overflow-x-auto">
          {series.map((point) => {
            const spendPct = (point.spending / maxValue) * 100
            const moneyPct = (point.moneyIn / maxValue) * 100
            return (
              <Link
                key={point.month}
                href={`/transactions?cycle=${point.month}`}
                aria-label={`${cycleKeyLabel(point.month)} — spent ${fmt(point.spending)}, money in ${fmt(point.moneyIn)}`}
                title={`${cycleKeyLabel(point.month)}: ${fmt(point.spending)}`}
                className="group flex min-w-8 flex-1 flex-col items-center gap-1.5"
              >
                <span
                  aria-hidden="true"
                  className="relative h-32 w-full overflow-hidden rounded-sm bg-muted"
                >
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-sm bg-foreground/80 group-hover:bg-foreground"
                    style={{ height: `${spendPct}%` }}
                  />
                  {point.moneyIn > 0 && (
                    <span
                      className="absolute inset-x-0 h-0.5 bg-emerald-500"
                      style={{ bottom: moneyInLineBottom(moneyPct) }}
                    />
                  )}
                </span>
                <span aria-hidden="true" className="text-[10px] tabular-nums text-muted-foreground">
                  {shortMonth(point.month)}
                </span>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg bg-muted px-4 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Not enough history yet.</p>
          <p>
            Keep uploading — {completedMonths}/{DEFAULT_TRAILING.minMonths} months so far. Your
            spending trend appears once there&apos;s a bit of history.
          </p>
        </div>
      )}
    </section>
  )
}
