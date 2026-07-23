"use client"

import { CircleCheck } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

/** A row the import couldn't parse, its cells mapped to roles (ADR-0025) — shown read-only. */
export interface CouldntReadRow {
  sourceRow: number
  reason: "bad-date" | "bad-amount"
  date: string
  amount: string
  merchant: string
  category: string
}

/** The post-commit outcome: the three buckets (added / already imported / couldn't read) + detail. */
export interface ImportSummary {
  added: number
  alreadyImported: number
  couldntRead: CouldntReadRow[]
  couldntReadTotal: number
  ignoredCount: number
  systematic: boolean
}

/**
 * The post-import outcome card (ADR-0025): the three named buckets, and — when any row couldn't be
 * read — an expandable, read-only list capped for a large systematic failure with an explanatory
 * hint. Recovery actions (Fix & import / Import anyway) arrive in later slices.
 */
export function ImportSummaryCard({ summary }: { summary: ImportSummary }) {
  const t = useTranslations("upload")
  const [showCouldntRead, setShowCouldntRead] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <output className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p className="tabular-nums">
          {[
            t("outcome.added", { count: summary.added }),
            summary.alreadyImported > 0 &&
              t("outcome.alreadyImported", { count: summary.alreadyImported }),
            summary.couldntReadTotal > 0 &&
              t("outcome.couldntRead", { count: summary.couldntReadTotal }),
          ]
            .filter(Boolean)
            .join(" · ")}
          {summary.ignoredCount > 0 && (
            <span className="text-muted-foreground">
              {" "}
              ({t("outcome.ignored", { count: summary.ignoredCount })})
            </span>
          )}
        </p>
      </output>

      {summary.couldntReadTotal > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowCouldntRead((shown) => !shown)}
            aria-expanded={showCouldntRead}
            className="self-start text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {showCouldntRead ? t("outcome.hideDetails") : t("outcome.showDetails")}
          </button>

          {showCouldntRead && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
              {summary.systematic && (
                <p className="text-muted-foreground">{t("outcome.systematicHint")}</p>
              )}
              <ul className="flex flex-col divide-y divide-border">
                {summary.couldntRead.map((row) => (
                  <li
                    key={row.sourceRow}
                    className="flex items-center justify-between gap-3 py-1.5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">{row.date}</span>
                      <span className="truncate">{row.merchant}</span>
                      <span className="tabular-nums">{row.amount}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {row.reason === "bad-date"
                        ? t("outcome.reasonBadDate")
                        : t("outcome.reasonBadAmount")}
                    </span>
                  </li>
                ))}
              </ul>
              {summary.couldntReadTotal > summary.couldntRead.length && (
                <p className="text-muted-foreground">
                  {t("outcome.andMore", {
                    count: summary.couldntReadTotal - summary.couldntRead.length,
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
