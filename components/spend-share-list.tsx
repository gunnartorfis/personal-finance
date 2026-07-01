import { cn } from "@/lib/utils"

/** One ranked row: a label with its spend and share (0..1) of the period total. */
export interface SpendShareItem {
  key: string
  label: string
  spending: number
  share: number
}

/**
 * A ranked "where the money goes" list with a share-of-spend meter per row (Phase K) — shared by the
 * top-merchants (K13) and account-breakdown (K15) modules so they read identically. Pure and
 * prop-driven; renders nothing when there are no items.
 */
export function SpendShareList({
  heading,
  items,
  currency,
  className,
}: {
  heading: string
  items: SpendShareItem[]
  currency: string
  className?: string
}) {
  if (items.length === 0) return null

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })

  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}>
      <h2 className="text-base font-medium">{heading}</h2>
      <ul role="list" className="flex flex-col gap-3">
        {items.map((item) => {
          const pct = Math.round(item.share * 100)
          return (
            <li key={item.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate text-sm font-medium">{item.label}</span>
                <span className="shrink-0 text-sm tabular-nums">{money.format(item.spending)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {pct}%
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
