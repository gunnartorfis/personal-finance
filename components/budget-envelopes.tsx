import { useTranslations } from "next-intl"

import type { BudgetStatus } from "@/lib/dashboard/budget-status"
import { currencyFormatter } from "@/lib/format/currency"
import type { Locale } from "@/lib/i18n/config"
import type { RealType } from "@/shared/types"
import { cn } from "@/lib/utils"

/** Maps each real expense type to its `budgets` i18n label key. */
const TYPE_LABEL: Record<RealType, "fixed" | "necessary" | "niceToHave"> = {
  Fixed: "fixed",
  Necessary: "necessary",
  "Nice to have": "niceToHave",
}

/** The meter fill per budget level: neutral under budget, amber near it, destructive over. */
const LEVEL_FILL = {
  ok: "bg-foreground/70",
  warning: "bg-amber-500",
  over: "bg-destructive",
} as const

/**
 * The budget-envelopes module (#103): this cycle's spend against each category budget, with a meter
 * per envelope. Prop-driven and pure; renders nothing when no budgets are set. Styling mirrors the
 * shared spend-list card.
 */
export function BudgetEnvelopes({
  status,
  currency,
  locale,
  className,
}: {
  status: BudgetStatus
  currency: string
  locale: Locale
  className?: string
}) {
  const t = useTranslations("dashboard.budgetEnvelopes")
  const typeT = useTranslations("budgets")
  if (status.envelopes.length === 0) return null

  const money = currencyFormatter(currency, locale)
  return (
    <section
      className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}
    >
      <h2 className="text-base font-medium">{t("title")}</h2>
      <ul role="list" className="flex flex-col gap-3">
        {status.envelopes.map((envelope) => {
          const pct = Math.min(100, Math.round(envelope.ratio * 100))
          return (
            <li key={envelope.type} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate text-sm font-medium">
                  {typeT(TYPE_LABEL[envelope.type])}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {t("ofBudget", {
                    spent: money.format(envelope.spent),
                    budget: money.format(envelope.budget),
                  })}
                </span>
              </div>
              <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", LEVEL_FILL[envelope.level])}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  envelope.level === "over" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {envelope.remaining >= 0
                  ? t("remaining", { amount: money.format(envelope.remaining) })
                  : t("over", { amount: money.format(-envelope.remaining) })}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
