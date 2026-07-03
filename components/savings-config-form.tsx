"use client"

import { CircleAlert, CircleCheck, Loader2, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { type FormEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface EntryRow {
  /** Stable client-side identity so React reconciles rows by entry, not by list position. */
  key: number
  name: string
  amount: string
}

let nextRowKey = 0
function newRow(name = "", amount = ""): EntryRow {
  nextRowKey += 1
  return { key: nextRowKey, name, amount }
}

/** One editable named-amount list (income sources or off-card costs). */
function EntryList({
  kind,
  rows,
  onChange,
}: {
  kind: "income" | "offcard"
  rows: EntryRow[]
  onChange: (rows: EntryRow[]) => void
}) {
  const t = useTranslations("incomeSettings")
  // EntryList owns all its own copy: the legend and add-button labels derive from `kind`, alongside
  // the field labels below — no pre-translated strings are threaded in as props.
  const idPrefix = kind
  const legend = t(kind === "income" ? "incomeLegend" : "offcardLegend")
  const addLabel = t(kind === "income" ? "addIncome" : "addOffcard")
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">{legend}</legend>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      )}
      {rows.map((row, index) => (
        <div key={row.key} className="flex items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-name-${index}`} className="text-xs text-muted-foreground">
              {t("nameLabel")}
            </label>
            <Input
              id={`${idPrefix}-name-${index}`}
              name={`${idPrefix}-name-${index}`}
              value={row.name}
              required
              onChange={(event) =>
                onChange(rows.map((r, i) => (i === index ? { ...r, name: event.target.value } : r)))
              }
            />
          </div>
          <div className="flex w-36 flex-col gap-1.5">
            <label
              htmlFor={`${idPrefix}-amount-${index}`}
              className="text-xs text-muted-foreground"
            >
              {t("amountLabel")}
            </label>
            <Input
              id={`${idPrefix}-amount-${index}`}
              name={`${idPrefix}-amount-${index}`}
              type="number"
              min={0}
              step={1}
              required
              value={row.amount}
              onChange={(event) =>
                onChange(
                  rows.map((r, i) => (i === index ? { ...r, amount: event.target.value } : r))
                )
              }
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("remove", { label: row.name || legend.toLowerCase() })}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, newRow()])}
        >
          <Plus />
          {addLabel}
        </Button>
      </div>
    </fieldset>
  )
}

/**
 * The Savings config form (ADR-0007, Phase J): the recurring Monthly income sources and Off-card
 * fixed costs (rent, loans — spend not on the uploaded cards) that feed the savings math. Saving
 * replaces both lists in full.
 */
export function SavingsConfigForm({ className }: { className?: string }) {
  const t = useTranslations("incomeSettings")
  const [loading, setLoading] = useState(true)
  const [incomeSources, setIncomeSources] = useState<EntryRow[]>([])
  const [offcardCosts, setOffcardCosts] = useState<EntryRow[]>([])
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let ignore = false
    async function loadInitial() {
      try {
        const res = await fetch("/api/savings/config")
        if (!res.ok) return
        const config = (await res.json()) as {
          incomeSources: Array<{ name: string; amount: number }>
          offcardCosts: Array<{ name: string; monthlyAmount: number }>
        }
        if (ignore) return
        setIncomeSources(config.incomeSources.map((s) => newRow(s.name, String(s.amount))))
        setOffcardCosts(config.offcardCosts.map((c) => newRow(c.name, String(c.monthlyAmount))))
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void loadInitial()
    return () => {
      ignore = true
    }
  }, [])

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setErrored(false)
    setSaved(false)
    try {
      const res = await fetch("/api/savings/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incomeSources: incomeSources.map((row) => ({
            name: row.name,
            amount: Number(row.amount),
          })),
          offcardCosts: offcardCosts.map((row) => ({
            name: row.name,
            monthlyAmount: Number(row.amount),
          })),
        }),
      })
      if (!res.ok) {
        setErrored(true)
        return
      }
      setSaved(true)
    } catch {
      setErrored(true)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>
  }

  return (
    <form
      onSubmit={saveConfig}
      aria-label={t("formLabel")}
      className={cn("flex flex-col gap-6 rounded-xl border border-border bg-card p-6", className)}
    >
      <EntryList kind="income" rows={incomeSources} onChange={setIncomeSources} />
      <EntryList kind="offcard" rows={offcardCosts} onChange={setOffcardCosts} />

      {errored && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{t("saveError")}</p>
        </div>
      )}
      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
          {t("saved")}
        </p>
      )}

      <div>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </form>
  )
}
