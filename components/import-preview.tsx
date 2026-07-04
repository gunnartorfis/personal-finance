"use client"

import { CircleCheck, FileWarning, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"

export type ColumnRole = "date" | "amount" | "merchant" | "category"
export type ColumnMapping = Record<ColumnRole, number>

/** The subset of `POST /api/uploads/preview`'s `status:"ok"` body this panel renders. */
export interface UploadPreviewData {
  header: string[]
  detectedMapping: Partial<ColumnMapping>
  mappingSource: "heuristic" | "remembered" | "ai" | "none"
  unmatchedRoles: ColumnRole[]
  rows: { sourceRow: number; date: string; amount: number; merchant: string; rawCategory: string }[]
  newCount: number
  duplicateCount: number
  wholeFileDuplicate: boolean
}

const ROLES: readonly ColumnRole[] = ["date", "amount", "merchant", "category"]

/** True once every role is mapped to a column (index ≥ 0). */
function isComplete(draft: Partial<ColumnMapping>): draft is ColumnMapping {
  return ROLES.every((role) => typeof draft[role] === "number" && (draft[role] as number) >= 0)
}

/**
 * The Import preview (ADR-0018): shown when an import needs a human decision — an AI-suggested or
 * incomplete mapping to confirm/fix, or a file that adds nothing. Confident imports never reach
 * here (the form auto-commits them). Confirming calls `onConfirm` with the finalized mapping, which
 * the caller sends to `POST /api/uploads`.
 */
export function ImportPreview({
  preview,
  accountName,
  busy,
  onConfirm,
  onCancel,
}: {
  preview: UploadPreviewData
  accountName: string
  busy: boolean
  onConfirm: (mapping: ColumnMapping) => void
  onCancel: () => void
}) {
  const t = useTranslations("upload.preview")
  const [draft, setDraft] = useState<Partial<ColumnMapping>>(preview.detectedMapping)

  if (preview.wholeFileDuplicate) {
    return (
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <FileWarning aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{t("wholeFileDuplicate")}</p>
        </div>
        <Button type="button" variant="outline" onClick={onCancel} className="self-start">
          {t("cancel")}
        </Button>
      </section>
    )
  }

  const complete = isComplete(draft)

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("reviewTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("account")}: {accountName}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
          {t("newRows", { count: preview.newCount })}
        </span>
        {preview.duplicateCount > 0 && (
          <span className="rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground tabular-nums">
            {t("duplicateRows", { count: preview.duplicateCount })}
          </span>
        )}
      </div>

      {preview.mappingSource === "ai" && (
        <p className="text-sm text-muted-foreground">{t("aiNote")}</p>
      )}
      {preview.unmatchedRoles.length > 0 && (
        <p className="text-sm text-muted-foreground">{t("unmatchedNote")}</p>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{t("mapHeading")}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLES.map((role) => {
            const selectId = `map-${role}`
            return (
              <div key={role} className="flex flex-col gap-1.5">
                <label htmlFor={selectId} className="text-sm font-medium">
                  {t(`roles.${role}`)}
                </label>
                <div className="grid grid-cols-[1fr_--spacing(7)] items-center rounded-md border border-input bg-input/20 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30">
                  <select
                    id={selectId}
                    name={selectId}
                    value={draft[role] ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        [role]: event.target.value === "" ? undefined : Number(event.target.value),
                      }))
                    }
                    className="col-span-full row-start-1 h-7 appearance-none bg-transparent py-0.5 pr-7 pl-2 text-sm outline-none"
                  >
                    <option value="">{t("chooseColumn")}</option>
                    {preview.header.map((label, index) => (
                      <option key={index} value={index}>
                        {label || `#${index + 1}`}
                      </option>
                    ))}
                  </select>
                  <svg
                    viewBox="0 0 8 5"
                    width="8"
                    height="5"
                    fill="none"
                    aria-hidden="true"
                    className="pointer-events-none col-start-2 row-start-1 place-self-center text-muted-foreground"
                  >
                    <path d="M.5.5 4 4 7.5.5" stroke="currentColor" />
                  </svg>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("sampleHeading")}</h3>
        <div className="-mx-6 -my-2 overflow-x-auto whitespace-nowrap">
          <div className="inline-block min-w-full px-6 py-2 align-middle">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium whitespace-nowrap">{t("roles.date")}</th>
                  <th className="py-1.5 pr-3 font-medium whitespace-nowrap">{t("roles.merchant")}</th>
                  <th className="py-1.5 pr-3 font-medium whitespace-nowrap">{t("roles.category")}</th>
                  <th className="py-1.5 text-right font-medium whitespace-nowrap">{t("roles.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 8).map((row) => (
                  <tr key={row.sourceRow} className="border-b border-border/60">
                    <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">{row.date}</td>
                    <td className="py-1.5 pr-3">{row.merchant}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{row.rawCategory}</td>
                    <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{row.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={busy || !complete}
          onClick={() => complete && onConfirm(draft)}
        >
          {busy ? <Loader2 className="animate-spin" /> : <CircleCheck />}
          {t("confirm")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </Button>
      </div>
    </section>
  )
}
