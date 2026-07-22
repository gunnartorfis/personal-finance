"use client"

import { useLocale, useTranslations } from "next-intl"

import type { SavingsGapCycle } from "@/lib/dashboard/savings-gap"
import { currencyFormatter } from "@/lib/format/currency"
import { formatCycleMonth } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The dashboard's Savings gap panel (ADR-0023, plan 007 slice 6): for the most recent comparable
 * cycle, the Household's inferred saving (flow) beside the observed net-worth change (stock) and the
 * gap between them. It only *displays* the two independently-computed figures and their difference —
 * a diagnostic, never merged, never written back (ADR-0023). Renders nothing when no cycle is
 * comparable (the loader returns `null` in that case).
 */
export function SavingsGapPanel({
  gaps,
  currency,
  className,
}: {
  gaps: SavingsGapCycle[]
  currency: string
  className?: string
}) {
  const t = useTranslations("dashboard.savingsGap")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const money = currencyFormatter(currency, locale)

  // Show the most recent comparable (covered) cycle — the freshest signal.
  const latest = [...gaps].reverse().find((cycle) => cycle.gap !== null)
  if (!latest) return null
  const { inferred, observedDelta, gap } = latest
  if (observedDelta === null || gap === null) return null

  const month = formatCycleMonth(latest.cycleKey, locale)
  const cell =
    "flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @sm:px-4 @sm:py-0 @sm:first:pl-0 @sm:last:pr-0"

  return (
    <section
      className={cn(
        "@container flex flex-col gap-4 rounded-xl border border-border bg-card p-6",
        className
      )}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("subtitle", { month })}</p>
      </header>

      <dl className="grid grid-cols-1 divide-y divide-border @sm:grid-cols-3 @sm:divide-x @sm:divide-y-0">
        <div className={cell}>
          <dt className="truncate text-sm text-muted-foreground">{t("inferred")}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{money.format(inferred)}</dd>
        </div>
        <div className={cell}>
          <dt className="truncate text-sm text-muted-foreground">{t("observed")}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{money.format(observedDelta)}</dd>
        </div>
        <div className={cell}>
          <dt className="truncate text-sm text-muted-foreground">{t("gap")}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{money.format(gap)}</dd>
        </div>
      </dl>

      <p className="text-sm text-pretty text-muted-foreground">{t("explainer")}</p>
    </section>
  )
}
