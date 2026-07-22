"use client"

import { useLocale, useTranslations } from "next-intl"

import { BalanceEntryForm } from "@/components/balance-entry-form"
import type { AccountBalance, NetWorth } from "@/lib/dashboard/net-worth"
import { computeAllocationShares } from "@/lib/dashboard/net-worth"
import { currencyFormatter } from "@/lib/format/currency"
import { formatDate } from "@/lib/format/date"
import { percentFormatter } from "@/lib/format/percent"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/** Nudge to refresh balances once the newest snapshot is at least this many whole weeks old — kept
 *  in weeks so the trigger and the displayed unit stay consistent (plan 007 slice 7). */
const STALE_AFTER_WEEKS = 4

/**
 * The dashboard's Holdings section (ADR-0016, plan 007 slice 3): "what the Household owns" — the
 * total (Net worth, relabeled) plus a per-Account breakdown, and the inline balance-entry form. The
 * total is the same figure as Net worth; only Accounts with a recorded Balance contribute a row.
 * Rendered only when the Household has at least one Account; until a Balance exists it invites entry.
 * Runway lives in the Financial health section (plan 007 default).
 */
export function HoldingsSection({
  netWorth,
  accounts,
  currency,
  balancesAgeDays,
  className,
}: {
  netWorth: NetWorth | null
  accounts: AccountBalance[]
  currency: string
  /** Whole days since the newest balance snapshot; `null` when none. Drives the staleness nudge. */
  balancesAgeDays?: number | null
  className?: string
}) {
  const t = useTranslations("dashboard.holdings")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const money = currencyFormatter(currency, locale)
  const percent = percentFormatter(locale)

  // No Accounts at all → nothing to value, so the section stays hidden entirely.
  if (accounts.length === 0) return null

  // Only Accounts with a recorded Balance are part of Holdings; unfunded ones are omitted from the
  // breakdown (they contribute nothing to the total either — computeNetWorth ignores them).
  const funded = accounts.filter((account) => account.balance !== null)
  // Each funded Account's share of the Holdings total, for the allocation % (plan 007 slice 4).
  const shareById = new Map(
    computeAllocationShares(funded.map((a) => ({ accountId: a.id, balance: a.balance ?? 0 }))).map(
      (a) => [a.accountId, a.share] as const
    )
  )
  // Whole weeks since the newest balance, for the staleness nudge (weeks, to match the copy's unit).
  const weeksOld = balancesAgeDays == null ? null : Math.floor(balancesAgeDays / 7)

  return (
    <section
      className={cn(
        "flex flex-col gap-6 rounded-xl border border-border bg-card p-6",
        className
      )}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("subtitle")}</p>
      </header>

      {netWorth ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{t("total")}</span>
            <span className="text-2xl font-semibold tabular-nums">{money.format(netWorth.total)}</span>
            <span className="text-sm text-muted-foreground">
              {/* UTC-anchored so SSR and client agree and a midnight-UTC snapshot never slips a day
                  west of UTC (cf. formatCycleMonth / the Financial health "as of"). */}
              {t("asOf", {
                date: formatDate(netWorth.asOf, locale, { dateStyle: "medium", timeZone: "UTC" }),
              })}
            </span>
          </div>

          <ul className="flex flex-col divide-y divide-border border-t border-border">
            {funded.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-4 py-2">
                <span className="truncate text-sm">{account.name}</span>
                <span className="flex items-baseline gap-2">
                  {shareById.get(account.id) != null && (
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {percent.format(shareById.get(account.id)!)}
                    </span>
                  )}
                  <span className="tabular-nums text-sm font-medium">
                    {money.format(account.balance ?? 0)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-pretty text-muted-foreground">{t("empty")}</p>
      )}

      {netWorth && weeksOld != null && weeksOld >= STALE_AFTER_WEEKS && (
        <p className="text-sm text-pretty text-muted-foreground">
          {t("staleNudge", { weeks: weeksOld })}
        </p>
      )}

      <BalanceEntryForm accounts={accounts} />
    </section>
  )
}
