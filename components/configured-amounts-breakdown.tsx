import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { currencyFormatter } from "@/lib/format/currency"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import type { CycleAmountsBreakdown } from "@/shared/income-timeline"
import { cn } from "@/lib/utils"

/**
 * The configured off-card amounts folded into a cycle's Transactions overview totals (ADR-0015) but
 * absent from the card-transaction list — surfaced as a recessed aside so the period totals don't
 * read as the sum of the table below. Recurring sources and one-off adjustments are shown separately
 * per side: costs subtract (negative), income adds (positive, emerald). Only the amounts actually
 * configured this cycle appear; the component renders nothing when there are none. Pure and
 * prop-driven, so it renders on the server, mirroring {@link CycleSummary}.
 */
export function ConfiguredAmountsBreakdown({
  breakdown,
  currency,
  className,
}: {
  breakdown: CycleAmountsBreakdown
  currency: string
  className?: string
}) {
  const t = useTranslations("transactions.configured")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const money = currencyFormatter(currency, locale)

  // Costs first (they drive the misread — the expense total looks too big for the table), then
  // income. Costs are shown as the negative they contribute to net; income as a positive magnitude.
  const lines = [
    { key: "recurringOffCardCost", amount: -breakdown.recurringOffCardCost, income: false },
    { key: "oneOffCost", amount: -breakdown.oneOffCost, income: false },
    { key: "recurringIncome", amount: breakdown.recurringIncome, income: true },
    { key: "oneOffIncome", amount: breakdown.oneOffIncome, income: true },
  ].filter((line) => line.amount !== 0)

  if (lines.length === 0) return null

  return (
    <section className={cn("flex flex-col gap-3 rounded-lg bg-muted/50 p-4", className)}>
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
      <dl className="flex flex-col gap-2">
        {lines.map((line) => (
          <div
            key={line.key}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <dt className="text-muted-foreground">{t(line.key)}</dt>
            <dd
              className={cn(
                "tabular-nums",
                line.income && "text-emerald-600 dark:text-emerald-500"
              )}
            >
              {money.format(line.amount)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
