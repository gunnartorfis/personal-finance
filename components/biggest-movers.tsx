import { ArrowUpRight } from "lucide-react"

import type { Mover } from "@/lib/dashboard/movers"
import { cn } from "@/lib/utils"

/** A titled list of risers (merchants or categories) with each one's increase vs its baseline. */
function MoverList({
  title,
  movers,
  money,
}: {
  title: string
  movers: Mover[]
  money: Intl.NumberFormat
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <ul role="list" className="flex flex-col gap-2">
        {movers.map((mover) => (
          <li key={mover.name} className="flex items-center justify-between gap-4">
            <span className="min-w-0 truncate text-sm font-medium">{mover.name}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
              <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />+{money.format(mover.delta)}
              <span className="text-xs">
                · {mover.deltaPct !== null ? `+${mover.deltaPct}%` : "new"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The biggest-movers module (Phase K, K14): what changed most this month, the explainer that pairs
 * with the hero's vs-average line. Lists the top merchant and category risers (last completed month
 * vs their baseline). Neutral, never alarming. Pure and prop-driven; renders nothing when neither
 * list has risers.
 */
export function BiggestMovers({
  movers,
  currency,
  className,
}: {
  movers: { merchants: Mover[]; categories: Mover[] }
  currency: string
  className?: string
}) {
  const { merchants, categories } = movers
  if (merchants.length === 0 && categories.length === 0) return null

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })

  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Biggest movers</h2>
        <p className="text-sm text-muted-foreground">Where spending rose most vs your usual.</p>
      </div>
      {merchants.length > 0 && <MoverList title="Merchants" movers={merchants} money={money} />}
      {categories.length > 0 && <MoverList title="Categories" movers={categories} money={money} />}
    </section>
  )
}
