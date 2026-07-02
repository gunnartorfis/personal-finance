"use client"

import { CircleAlert, CircleCheck, Loader2, Plus, Trash2 } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface EntryRow {
  name: string
  amount: string
}

/** One editable named-amount list (income sources or off-card costs). */
function EntryList({
  legend,
  idPrefix,
  addLabel,
  rows,
  onChange,
}: {
  legend: string
  idPrefix: string
  addLabel: string
  rows: EntryRow[]
  onChange: (rows: EntryRow[]) => void
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">{legend}</legend>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">None yet.</p>
      )}
      {rows.map((row, index) => (
        <div key={index} className="flex items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-name-${index}`} className="text-xs text-muted-foreground">
              Name
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
              Amount / month
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
            aria-label={`Remove ${row.name || legend.toLowerCase()}`}
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
          onClick={() => onChange([...rows, { name: "", amount: "" }])}
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
        setIncomeSources(
          config.incomeSources.map((s) => ({ name: s.name, amount: String(s.amount) }))
        )
        setOffcardCosts(
          config.offcardCosts.map((c) => ({ name: c.name, amount: String(c.monthlyAmount) }))
        )
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
    return <p className="text-sm text-muted-foreground">Loading config…</p>
  }

  return (
    <form
      onSubmit={saveConfig}
      aria-label="Savings config"
      className={cn("flex flex-col gap-6 rounded-xl border border-border bg-card p-6", className)}
    >
      <EntryList
        legend="Income sources"
        idPrefix="income"
        addLabel="Add income source"
        rows={incomeSources}
        onChange={setIncomeSources}
      />
      <EntryList
        legend="Off-card costs"
        idPrefix="offcard"
        addLabel="Add off-card cost"
        rows={offcardCosts}
        onChange={setOffcardCosts}
      />

      {errored && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>Couldn’t save the config. Check the values and try again.</p>
        </div>
      )}
      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
          Config saved.
        </p>
      )}

      <div>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          Save config
        </Button>
      </div>
    </form>
  )
}
