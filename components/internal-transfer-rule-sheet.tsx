"use client"

import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatDate } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"

type Preview =
  | { available: false }
  | {
      available: true
      active: boolean
      historical: { count: number; sample: { id: string; date: string; amount: number }[] }
    }

type PreviewState = { preview: Preview | "loading" | "loadError" }

export function useInternalTransferRulePreview(transactionId: string) {
  const [state, setState] = useState<PreviewState | null>(null)

  async function open() {
    const request: PreviewState = { preview: "loading" }
    setState(request)
    try {
      const res = await fetch(`/api/transactions/${transactionId}/internal-transfer-rule`, { method: "POST" })
      if (!res.ok) throw new Error("preview failed")
      const preview: Preview = await res.json()
      setState((current) => current === request ? { preview } : current)
    } catch {
      setState((current) => current === request ? { preview: "loadError" } : current)
    }
  }

  return { state, open, close: () => setState(null) }
}

export function InternalTransferRuleSheet({
  transactionId,
  state,
  merchant,
  formatAmount,
  onClose,
  onSaved,
  onExclude,
}: {
  transactionId: string
  state: PreviewState
  merchant: string
  formatAmount: (amount: number) => string
  onClose: () => void
  onSaved: () => void
  onExclude: () => void
}) {
  const t = useTranslations("internalTransferRule")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const preview = typeof state.preview === "object" ? state.preview : null
  const [includePast, setIncludePast] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const endpoint = `/api/transactions/${transactionId}/internal-transfer-rule`

  async function save(remove: boolean) {
    setSaving(true)
    setSaveError(false)
    try {
      const res = await fetch(endpoint, remove
        ? { method: "DELETE" }
        : {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ includePast }),
          })
      if (!res.ok) throw new Error("rule update failed")
      onSaved()
      onClose()
    } catch {
      setSaveError(true)
      setSaving(false)
    }
  }

  const history = preview?.available ? preview.historical : null
  const more = history ? history.count - history.sample.length : 0

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="overflow-y-auto" showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description", { account: merchant || t("bankAccount") })}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-6 text-sm">
          {state.preview === "loadError" && <p role="alert" className="text-destructive">{t("loadError")}</p>}
          {saveError && <p role="alert" className="text-destructive">{t("saveError")}</p>}
          {state.preview === "loading" && <p role="status">{t("loading")}</p>}
          {preview && !preview.available && <p>{t("unavailable")}</p>}
          {preview?.available && preview.active && <p>{t("active")}</p>}
          {history && history.count > 0 && (
            <>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={includePast}
                  onChange={(event) => setIncludePast(event.target.checked)}
                />
                {t("includePast", { count: history.count })}
              </label>
              <ul className="divide-y rounded-md border px-3">
                {history.sample.map((row) => (
                  <li key={row.id} className="flex justify-between gap-2 py-2 tabular-nums">
                    <span>{formatDate(new Date(row.date), locale, { dateStyle: "medium", timeZone: "UTC" })}</span>
                    <span>{formatAmount(row.amount)}</span>
                  </li>
                ))}
              </ul>
              {more > 0 && <p className="text-muted-foreground">{t("more", { count: more })}</p>}
            </>
          )}
        </div>
        <SheetFooter>
          {preview?.available && (!preview.active || includePast) && (
            <Button onClick={() => void save(false)} disabled={saving}>
              {t(preview.active ? "applyPast" : "confirm")}
            </Button>
          )}
          {preview?.available && preview.active && (
            <Button variant="outline" onClick={() => void save(true)} disabled={saving}>
              {t("remove")}
            </Button>
          )}
          {preview && !preview.available && (
            <Button variant="outline" onClick={onExclude}>{t("excludeOne")}</Button>
          )}
          <SheetClose render={<Button variant="ghost" />} disabled={saving}>{t("close")}</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
