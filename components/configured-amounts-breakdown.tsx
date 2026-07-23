import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { currencyFormatter } from "@/lib/format/currency"
import type { ConfiguredCycleItems } from "@/lib/dashboard/configured-amounts"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The configured amounts folded into a cycle's Transactions overview totals (ADR-0015) but absent
 * from the card-transaction list — surfaced as a recessed aside so the totals don't read as the sum
 * of the table below. Itemized to mirror the Income-settings sections: recurring income as a single
 * line (shown only when it differs from the overview's Income, so the same figure isn't repeated),
 * off-card fixed costs listed per source, and one-off adjustments listed with their labels. Costs
 * subtract (negative); income adds (positive, emerald). Renders nothing when there's nothing to show.
 * Prop-driven, so it renders on the server, mirroring {@link CycleSummary}.
 */
export function ConfiguredAmountsBreakdown({
  items,
  showIncomeSources,
  currency,
  className,
}: {
  items: ConfiguredCycleItems
  /** Whether to show the recurring-income line — false when it equals the overview's Income total. */
  showIncomeSources: boolean
  currency: string
  className?: string
}) {
  const t = useTranslations("transactions.configured")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const money = currencyFormatter(currency, locale)
  const fmt = (amount: number) => money.format(amount)

  const hasOneOffs = items.oneOffCosts.length > 0 || items.oneOffIncomes.length > 0
  const hasContent = showIncomeSources || items.offCardCosts.length > 0 || hasOneOffs
  if (!hasContent) return null

  const row = (
    key: string,
    label: string,
    amount: number,
    { income = false, muted = false }: { income?: boolean; muted?: boolean } = {}
  ) => (
    <div key={key} className="flex items-center justify-between gap-3 text-sm">
      <span className={cn(muted ? "text-muted-foreground" : "font-medium")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          income && "text-emerald-600 dark:text-emerald-500"
        )}
      >
        {fmt(amount)}
      </span>
    </div>
  )

  return (
    <section
      className={cn("flex flex-col gap-3 rounded-lg bg-muted/50 p-4", className)}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium">{t("heading")}</h2>
        <Link
          href="/settings/income"
          className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {t("settingsLink")}
        </Link>
      </div>
      <p className="text-sm text-pretty text-muted-foreground">{t("caption")}</p>

      <div className="flex flex-col gap-3">
        {showIncomeSources &&
          row("income", t("recurringIncome"), items.incomeSourcesTotal, {
            income: true,
          })}

        {items.offCardCosts.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{t("offCardHeading")}</p>
            <div className="flex flex-col gap-1 pl-3">
              {items.offCardCosts.map((cost) =>
                row(`off-${cost.name}`, cost.name, -cost.amount, { muted: true })
              )}
            </div>
          </div>
        )}

        {hasOneOffs && (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{t("oneOffHeading")}</p>
            <div className="flex flex-col gap-1 pl-3">
              {items.oneOffCosts.map((cost, index) =>
                row(`oc-${index}`, cost.label ?? t("oneOffFallback"), -cost.amount, {
                  muted: true,
                })
              )}
              {items.oneOffIncomes.map((incomeItem, index) =>
                row(
                  `oi-${index}`,
                  incomeItem.label ?? t("oneOffFallback"),
                  incomeItem.amount,
                  { muted: true, income: true }
                )
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
