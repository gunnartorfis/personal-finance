"use client"

import { CircleCheck } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/format/date"
import type { Locale } from "@/lib/i18n/config"
import { prefillCorrection } from "@/lib/ingestion/correction-prefill"

/** A row the import couldn't parse, its cells mapped to roles (ADR-0025). */
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
  alreadyImported: number
  alreadyImportedRows: AlreadyImportedRow[]
  couldntRead: CouldntReadRow[]
  couldntReadTotal: number
  ignoredCount: number
  systematic: boolean
}

/** Outcome of a single Fix & import / Import anyway: how the row resolved through the append. */
export type RecoveredOutcome = { appended: number; duplicates: number }

type T = ReturnType<typeof useTranslations>

function provenanceLabel(t: T, locale: Locale, row: AlreadyImportedRow): string {
  if (!row.importedAt) return t("outcome.provenanceUnknown")
  const date = formatDate(new Date(row.importedAt), locale)
  return row.fileName
    ? t("outcome.provenance", { date, file: row.fileName })
    : t("outcome.provenanceNoFile", { date })
}

/** One already-imported row: its provenance plus a per-row Import anyway (force past dedup). */
function AlreadyImportedRowItem({
  uploadId,
  row,
  onForced,
}: {
  uploadId: string
  row: AlreadyImportedRow
  onForced: (sourceRow: number) => void
}) {
  const t = useTranslations("upload")
  const locale = useLocale() as Locale
  const [status, setStatus] = useState<"idle" | "busy" | "failed">("idle")

  async function importAnyway() {
    if (status === "busy") return
    setStatus("busy")
    try {
      const res = await fetch(`/api/uploads/${uploadId}/rows`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: row.date,
          amount: row.amount,
          merchant: row.merchant,
          category: row.category,
          sourceRow: row.sourceRow,
          force: true,
        }),
      })
      if (!res.ok) throw new Error("failed")
      // A 2xx means the row is imported (fresh, or a retry that no-ops a lost insert) — the count
      // it returns doesn't matter to the UI; move the row to added regardless.
      onForced(row.sourceRow)
    } catch {
      setStatus("failed")
    }
  }

  return (
    <li className="flex flex-col gap-1 py-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="tabular-nums text-muted-foreground">{row.date}</span>
          <span className="truncate">{row.merchant}</span>
          <span className="tabular-nums">{row.amount}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">{provenanceLabel(t, locale, row)}</span>
          <Button type="button" size="sm" disabled={status === "busy"} onClick={importAnyway}>
            {t("outcome.importAnyway")}
          </Button>
        </span>
      </div>
      {status === "failed" && (
        <p role="alert" className="text-xs text-destructive">
          {t("outcome.importAnywayFailed")}
        </p>
      )}
    </li>
  )
}

/** The already-imported subsection: each deduped row with provenance and a per-row Import anyway. */
function AlreadyImportedList({
  uploadId,
  rows,
  total,
  onForced,
}: {
  uploadId: string
  rows: AlreadyImportedRow[]
  total: number
  onForced: (sourceRow: number) => void
}) {
  const t = useTranslations("upload")
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t("outcome.alreadyImportedHeading")}
      </h3>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <AlreadyImportedRowItem
            key={row.sourceRow}
            uploadId={uploadId}
            row={row}
            onForced={onForced}
          />
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

/** One couldn't-read row as an editable form: fix the broken cell, then import it through dedup. */
function CouldntReadRowEditor({
  uploadId,
  row,
  onRecovered,
}: {
  uploadId: string
  row: CouldntReadRow
  onRecovered: (sourceRow: number, outcome: RecoveredOutcome) => void
}) {
  const t = useTranslations("upload")
  // One cohesive form value + a request status — deliberately not five separate useState calls.
  const [fields, setFields] = useState(() =>
    prefillCorrection({ date: row.date, amount: row.amount, merchant: row.merchant }),
  )
  const [status, setStatus] = useState<"idle" | "busy" | "failed">("idle")

  const amountNum = Number(fields.amount)
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(fields.date) &&
    fields.amount.trim() !== "" &&
    Number.isInteger(amountNum) &&
    fields.merchant.trim() !== ""

  async function fix() {
    if (!valid || status === "busy") return
    setStatus("busy")
    try {
      const res = await fetch(`/api/uploads/${uploadId}/rows`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: fields.date,
          amount: amountNum,
          merchant: fields.merchant.trim(),
          category: row.category,
          sourceRow: row.sourceRow,
        }),
      })
      if (!res.ok) throw new Error("failed")
      const data = (await res.json()) as { appended?: number; duplicates?: number }
      // On success the parent drops this row, unmounting the editor — no state reset needed.
      onRecovered(row.sourceRow, { appended: data.appended ?? 0, duplicates: data.duplicates ?? 0 })
    } catch {
      setStatus("failed")
    }
  }

  return (
    <li className="flex flex-col gap-1.5 py-2">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          type="date"
          aria-label={t("preview.roles.date")}
          value={fields.date}
          onChange={(event) => setFields((prev) => ({ ...prev, date: event.target.value }))}
          className="w-40"
        />
        <Input
          type="number"
          aria-label={t("preview.roles.amount")}
          value={fields.amount}
          onChange={(event) => setFields((prev) => ({ ...prev, amount: event.target.value }))}
          className="w-28"
        />
        <Input
          type="text"
          aria-label={t("preview.roles.merchant")}
          value={fields.merchant}
          onChange={(event) => setFields((prev) => ({ ...prev, merchant: event.target.value }))}
          className="min-w-32 flex-1"
        />
        <Button type="button" size="sm" disabled={!valid || status === "busy"} onClick={fix}>
          {t("outcome.fixImport")}
        </Button>
      </div>
      {status === "failed" && (
        <p role="alert" className="text-xs text-destructive">
          {t("outcome.fixFailed")}
        </p>
      )}
    </li>
  )
}

/** The couldn't-read subsection: each unreadable row as a Fix & import editor, capped + hinted. */
function CouldntReadList({
  uploadId,
  rows,
  total,
  systematic,
  onRecovered,
}: {
  uploadId: string
  rows: CouldntReadRow[]
  total: number
  systematic: boolean
  onRecovered: (sourceRow: number, outcome: RecoveredOutcome) => void
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
          <CouldntReadRowEditor
            key={row.sourceRow}
            uploadId={uploadId}
            row={row}
            onRecovered={onRecovered}
          />
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
 * — a "Show details" panel with an already-imported subsection (each row's provenance, read-only)
 * and a couldn't-read subsection (each row an inline Fix & import editor that appends through the
 * normal dedup path). Import anyway (dedup override) for the already-imported bucket lands next.
 */
export function ImportSummaryCard({
  summary,
  uploadId,
  onRecovered,
  onForced,
}: {
  summary: ImportSummary
  uploadId: string
  onRecovered: (sourceRow: number, outcome: RecoveredOutcome) => void
  onForced: (sourceRow: number) => void
}) {
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
                  uploadId={uploadId}
                  rows={summary.alreadyImportedRows}
                  total={summary.alreadyImported}
                  onForced={onForced}
                />
              )}
              {summary.couldntReadTotal > 0 && (
                <CouldntReadList
                  uploadId={uploadId}
                  rows={summary.couldntRead}
                  total={summary.couldntReadTotal}
                  systematic={summary.systematic}
                  onRecovered={onRecovered}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
