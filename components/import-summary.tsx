"use client"

import { CircleCheck } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { formatDate } from "@/lib/format/date"
import type { Locale } from "@/lib/i18n/config"

/** A row the import couldn't parse, its cells mapped to roles (ADR-0025) — shown read-only. */
export interface CouldntReadRow {
  sourceRow: number
  reason: "bad-date" | "bad-amount"
  date: string
  amount: string
  merchant: string
  category: string
}

/** A deduped ("already imported") row with the provenance of where it first came in (ADR-0025). */
export interface AlreadyImportedRow {
  sourceRow: number
  date: string
  amount: number
  merchant: string
  category: string
  importedAt: string | null
  fileName: string | null
}

/** The post-commit outcome: the three buckets (added / already imported / couldn't read) + detail. */
export interface ImportSummary {
  added: number
  /** Count of already-imported (deduped) rows — the total, before the detail cap. */
  alreadyImported: number
  alreadyImportedRows: AlreadyImportedRow[]
  couldntRead: CouldntReadRow[]
  couldntReadTotal: number
  ignoredCount: number
  systematic: boolean
}

type T = ReturnType<typeof useTranslations>

function provenanceLabel(t: T, locale: Locale, row: AlreadyImportedRow): string {
  if (!row.importedAt) return t("outcome.provenanceUnknown")
  const date = formatDate(new Date(row.importedAt), locale)
  return row.fileName
    ? t("outcome.provenance", { date, file: row.fileName })
    : t("outcome.provenanceNoFile", { date })
}

/** The already-imported subsection: each deduped row with when/where it first came in. */
function AlreadyImportedList({ rows, total }: { rows: AlreadyImportedRow[]; total: number }) {
  const t = useTranslations("upload")
  const locale = useLocale() as Locale
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t("outcome.alreadyImportedHeading")}
      </h3>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.sourceRow} className="flex items-center justify-between gap-3 py-1.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="tabular-nums text-muted-foreground">{row.date}</span>
              <span className="truncate">{row.merchant}</span>
              <span className="tabular-nums">{row.amount}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {provenanceLabel(t, locale, row)}
            </span>
          </li>
        ))}
      </ul>
      {total > rows.length && (
        <p className="text-muted-foreground">
          {t("outcome.andMoreImported", { count: total - rows.length })}
        </p>
      )}
    </section>
  )
}

/** The couldn't-read subsection: each unreadable row with its reason, capped, with a systematic hint. */
function CouldntReadList({
  rows,
  total,
  systematic,
}: {
  rows: CouldntReadRow[]
  total: number
  systematic: boolean
}) {
  const t = useTranslations("upload")
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t("outcome.couldntReadHeading")}
      </h3>
      {systematic && <p className="text-muted-foreground">{t("outcome.systematicHint")}</p>}
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.sourceRow} className="flex items-center justify-between gap-3 py-1.5">
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
      {total > rows.length && (
        <p className="text-muted-foreground">
          {t("outcome.andMore", { count: total - rows.length })}
        </p>
      )}
    </section>
  )
}

/**
 * The post-import outcome card (ADR-0025): the three named buckets, and — when any row was withheld
 * — a "Show details" panel with an already-imported subsection (each row's provenance) and a
 * couldn't-read subsection (each row's reason, capped, with a systematic-failure hint). Read-only;
 * recovery actions (Fix & import / Import anyway) arrive in later slices.
 */
export function ImportSummaryCard({ summary }: { summary: ImportSummary }) {
  const t = useTranslations("upload")
  const [showDetails, setShowDetails] = useState(false)
  const hasDetails = summary.alreadyImportedRows.length > 0 || summary.couldntReadTotal > 0

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

      {hasDetails && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowDetails((shown) => !shown)}
            aria-expanded={showDetails}
            className="self-start text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {showDetails ? t("outcome.hideDetails") : t("outcome.showDetails")}
          </button>

          {showDetails && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 text-sm">
              {summary.alreadyImportedRows.length > 0 && (
                <AlreadyImportedList
                  rows={summary.alreadyImportedRows}
                  total={summary.alreadyImported}
                />
              )}
              {summary.couldntReadTotal > 0 && (
                <CouldntReadList
                  rows={summary.couldntRead}
                  total={summary.couldntReadTotal}
                  systematic={summary.systematic}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
