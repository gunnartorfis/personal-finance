"use client"

import { Loader2, RotateCcw, Undo2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"

/**
 * One row of the Upload-history view-model. Built by the server page (`app/(app)/upload/page.tsx`)
 * from `repo.uploads.listHistory()` + resolved Member names. Dates are ISO strings (serializable
 * across the RSC boundary, re-parsed here — the same convention as <ActivityLogView>); `status` is
 * derived from `undoneAt` on the server so the client never re-derives it.
 */
export interface UploadHistoryItem {
  id: string
  fileName: string
  accountName: string
  importedByName: string | null
  createdAt: string
  undoneAt: string | null
  undoneByName: string | null
  transactionCount: number
  supersededByReimport: boolean
  status: "active" | "undone"
}

/**
 * The member-facing Upload history (ADR-0024, slice 5): every CSV Upload the Household has made,
 * newest-first, with the controls to Undo an active Upload (archiving its Transactions, reversibly)
 * or Restore an undone one. Mirrors <ActivityLogView>'s divider-separated list + locale-aware date
 * formatting, and <DisconnectButton>'s inline-confirm pattern (there is no dialog primitive). The
 * mutations POST to `/api/uploads/:id/(undo|restore)` and `router.refresh()` the server-rendered
 * list on success.
 */
export function UploadHistory({ items }: { items: UploadHistoryItem[] }) {
  const t = useTranslations("upload.history")

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{t("heading")}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <UploadHistoryRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * A single history row: the file metadata on the left, the Undo/Restore control on the right. Owns
 * its own confirm/busy/error state so one row's pending mutation never touches its siblings. An
 * undone Upload whose file was re-imported (`supersededByReimport`, or a 409 from a racing restore)
 * shows a muted note instead of Restore — restoring would duplicate the now-live rows (ADR-0024).
 */
function UploadHistoryRow({ item }: { item: UploadHistoryItem }) {
  const t = useTranslations("upload.history")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)
  const [superseded, setSuperseded] = useState(false)

  const created = new Date(item.createdAt)
  const importer = item.importedByName
    ? t("importedBy", { name: item.importedByName })
    : t("importedByUnknown")

  async function undo() {
    setBusy(true)
    setErrored(false)
    try {
      const res = await fetch(`/api/uploads/${item.id}/undo`, { method: "POST" })
      if (!res.ok) throw new Error("undo failed")
      setConfirming(false)
      router.refresh()
    } catch {
      setErrored(true)
    } finally {
      setBusy(false)
    }
  }

  async function restore() {
    setBusy(true)
    setErrored(false)
    try {
      const res = await fetch(`/api/uploads/${item.id}/restore`, { method: "POST" })
      // 409: the file was re-imported after this Upload was undone, so Restore is withdrawn — show
      // the note now, and refresh so the server-rendered row agrees (ADR-0024 clean-slate).
      if (res.status === 409) {
        setSuperseded(true)
        router.refresh()
        return
      }
      if (!res.ok) throw new Error("restore failed")
      router.refresh()
    } catch {
      setErrored(true)
    } finally {
      setBusy(false)
    }
  }

  const isSuperseded = item.supersededByReimport || superseded

  return (
    <li className="flex flex-col gap-2 border-t border-border py-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-medium break-words text-foreground">{item.fileName}</p>
          <p className="text-sm text-muted-foreground">
            {item.accountName} · {t("transactionCount", { count: item.transactionCount })}
          </p>
          <p className="text-sm text-muted-foreground">
            {importer} ·{" "}
            <time dateTime={created.toISOString()} className="tabular-nums">
              {formatDate(created, locale, { dateStyle: "medium", timeStyle: "short" })}
            </time>
          </p>
          {item.status === "undone" && item.undoneAt ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                {t("undoneBadge")}
              </span>
              <span className="text-muted-foreground">
                {item.undoneByName
                  ? t("undoneBy", {
                      name: item.undoneByName,
                      date: formatDate(new Date(item.undoneAt), locale, { dateStyle: "medium" }),
                    })
                  : formatDate(new Date(item.undoneAt), locale, { dateStyle: "medium" })}
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {item.status === "active" ? (
            confirming ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirming(false)
                    setErrored(false) // don't carry a prior failure into the next attempt
                  }}
                  disabled={busy}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void undo()}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {t("confirm")}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                <Undo2 />
                {t("undo")}
              </Button>
            )
          ) : isSuperseded ? (
            <p className="text-sm text-muted-foreground">{t("supersededNote")}</p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void restore()}
              disabled={busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              {t("restore")}
            </Button>
          )}
        </div>
      </div>

      {confirming && item.status === "active" ? (
        <p className="text-sm text-pretty text-muted-foreground">
          {t("undoConfirm", { count: item.transactionCount })}
        </p>
      ) : null}

      {errored ? (
        <p role="alert" className="text-xs text-destructive">
          {item.status === "active" ? t("undoError") : t("restoreError")}
        </p>
      ) : null}
    </li>
  )
}
