import { useTranslations } from "next-intl"

import { currencyFormatter } from "@/lib/format/currency"
import type { Locale } from "@/lib/i18n/config"
import type { RecurringSummary } from "@/lib/dashboard/recurring"
import { cn } from "@/lib/utils"

/**
 * The recurring-charges module (#100): the subscriptions we detected and the total committed monthly
 * spend they add up to. Prop-driven and pure; renders nothing when nothing recurring was detected.
 * Styling mirrors the shared spend-list card so it reads as part of the same dashboard system.
 */
export function RecurringSubscriptions({
  recurring,
  currency,
  locale,
  className,
}: {
  recurring: RecurringSummary
  currency: string
  locale: Locale
  className?: string
}) {
  const t = useTranslations("dashboard")
  if (recurring.subscriptions.length === 0) return null

  const money = currencyFormatter(currency, locale)
  return (
    <section
      className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-medium">{t("recurring.title")}</h2>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {t("recurring.committed", { amount: money.format(recurring.committedMonthlyTotal) })}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {recurring.subscriptions.map((sub) => (
          <li key={sub.merchant} className="flex items-baseline justify-between gap-4">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{sub.merchant}</span>
              <span className="text-xs text-muted-foreground">
                {t("recurring.months", { count: sub.occurrences })}
              </span>
            </div>
            <span className="shrink-0 text-sm tabular-nums">{money.format(sub.monthlyAmount)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
