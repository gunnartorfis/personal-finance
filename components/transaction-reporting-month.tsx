"use client"

import { useLocale, useTranslations } from "next-intl"
import { useId, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { previousCycleKey } from "@/lib/dashboard/cycle"
import { formatCycleMonth, formatDate } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"

const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"))

export function TransactionReportingMonth({
  transactionId,
  date,
  reportingMonth,
  editable,
  onMoved,
}: {
  transactionId: string
  date: string
  reportingMonth?: string | null
  editable: boolean
  onMoved: (month: string) => void
}) {
  const t = useTranslations("transactions.reportingMonth")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const fieldId = useId()
  const original = date.slice(0, 7)
  const current = reportingMonth?.slice(0, 7) ?? original
  const previous = previousCycleKey(original)
  const suggested = reportingMonth || previous.length !== 7 || previous.startsWith("0000")
    ? current
    : previous
  const [editing, setEditing] = useState(false)
  const [year, setYear] = useState(suggested.slice(0, 4))
  const [month, setMonth] = useState(suggested.slice(5))
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle")
  const target = `${year}-${month}`

  async function save(destination: string | null) {
    setStatus("saving")
    try {
      const response = await fetch(`/api/transactions/${transactionId}/reporting-month`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: destination }),
      })
      if (!response.ok) throw new Error("Reporting month update failed")
      const { month: savedMonth } = await response.json() as { month: string }
      onMoved(savedMonth)
    } catch {
      setStatus("error")
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void save(target)
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border p-6 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-muted-foreground">{t("label")}</span>
          <p className="font-medium">{formatCycleMonth(current, locale)}</p>
        </div>
        {editable && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {t("change")}
          </Button>
        )}
      </div>
      {editing && (
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <fieldset disabled={status === "saving"} className="flex gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={`${fieldId}-month`}>{t("month")}</label>
              <select
                id={`${fieldId}-month`}
                className="h-8 rounded-lg border border-input bg-background px-2"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              >
                {MONTHS.map((value) => (
                  <option key={value} value={value}>
                    {formatDate(new Date(`2000-${value}-01`), locale, { month: "long", timeZone: "UTC" })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-24 flex-col gap-1">
              <label htmlFor={`${fieldId}-year`}>{t("year")}</label>
              <Input
                id={`${fieldId}-year`}
                type="text"
                inputMode="numeric"
                pattern="(?!0000)[0-9]{4}"
                maxLength={4}
                required
                value={year}
                onChange={(event) => setYear(event.target.value)}
              />
            </div>
          </fieldset>
          <p className="text-muted-foreground">{t("description")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={status === "saving" || target === current}>
              {t("save")}
            </Button>
            {reportingMonth && (
              <Button type="button" size="sm" variant="ghost" disabled={status === "saving"} onClick={() => void save(null)}>
                {t("reset")}
              </Button>
            )}
          </div>
          {status === "error" && <p role="alert" className="text-destructive">{t("error")}</p>}
        </form>
      )}
    </div>
  )
}
