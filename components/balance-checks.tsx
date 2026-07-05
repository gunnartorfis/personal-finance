import { useTranslations } from "next-intl"

import type { AccountBalanceCheck } from "@/lib/dashboard/balance-check"
import { currencyFormatter } from "@/lib/format/currency"
import type { Locale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The balance-check module (#98): accounts whose imported transactions don't add up to the balance
 * you recorded — a positive drift hints at a missing row, a negative one at a duplicate. Prop-driven
 * and pure; renders nothing when every checked account matches (nothing to act on). Styling mirrors
 * the shared spend-list card. Deliberately "balance check", not "reconcile" (a reserved term).
 */
export function BalanceChecks({
  checks,
  currency,
  locale,
  className,
}: {
  checks: AccountBalanceCheck[]
  currency: string
  locale: Locale
  className?: string
}) {
  const t = useTranslations("dashboard.balanceChecks")
  const drifted = checks.filter((c) => !c.check.matches)
  if (drifted.length === 0) return null

  const money = currencyFormatter(currency, locale)
  return (
    <section
      className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("subtitle")}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {drifted.map(({ accountId, name, check }) => (
          <li key={accountId} className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{name}</span>
            <span className="text-sm text-muted-foreground">
              {check.drift > 0
                ? t("missing", { amount: money.format(check.drift) })
                : t("duplicate", { amount: money.format(-check.drift) })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
