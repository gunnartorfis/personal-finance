import type { MerchantSpend } from "@/lib/dashboard/top-merchants"
import { cn } from "@/lib/utils"

/**
 * The top-merchants module (Phase K, K13): where the money actually goes over the trailing window.
 * A ranked list of merchants, each with its spend and a share-of-spend meter. Pure and prop-driven
 * off the view-model's `topMerchants`; renders nothing when there's no spend to show.
 */
export function TopMerchants({
  merchants,
  currency,
  className,
}: {
  merchants: MerchantSpend[]
  currency: string
  className?: string
}) {
  if (merchants.length === 0) return null

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })

  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}>
      <h2 className="text-base font-medium">Top merchants</h2>
      <ul role="list" className="flex flex-col gap-3">
        {merchants.map((merchant) => {
          const pct = Math.round(merchant.share * 100)
          return (
            <li key={merchant.merchant} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate text-sm font-medium">{merchant.merchant}</span>
                <span className="shrink-0 text-sm tabular-nums">{money.format(merchant.spending)}</span>
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
