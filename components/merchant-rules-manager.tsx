"use client"

import { type FormEvent, useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { TYPES, type ExpenseType, type RealType } from "@/shared/types"

/** A merchant rule as returned by `GET /api/merchant-rules`. */
interface MerchantRule {
  id: string
  merchant: string
  flatType: ExpenseType | null
  threshold: number | null
  atOrAboveType: ExpenseType | null
  belowType: ExpenseType | null
}

const LABELS: Record<ExpenseType, string> = {
  Fixed: "Fixed",
  Necessary: "Necessary",
  "Nice to have": "Nice to have",
  "": "Split / none",
}

/** Render a rule's effect — a flat type, or a split by charge magnitude. */
function describeRule(rule: MerchantRule): string {
  if (rule.flatType !== null) return LABELS[rule.flatType]
  return `≥ ${rule.threshold} → ${LABELS[rule.atOrAboveType ?? ""]}, below → ${LABELS[rule.belowType ?? ""]}`
}

/**
 * Manage the current Household's merchant rules (Phase F): list them with delete, and an add form
 * for flat rules (merchant → type). Split rules created via the API are shown read-only. Each
 * mutation refetches so the list reflects server state.
 */
export function MerchantRulesManager({ className }: { className?: string }) {
  const [rules, setRules] = useState<MerchantRule[]>([])
  const [loading, setLoading] = useState(true)
  const [merchant, setMerchant] = useState("")
  // A flat rule only offers the actionable types — never `""` (the not-bucketed / split type).
  const [flatType, setFlatType] = useState<RealType>("Fixed")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Pure fetch (no setState) so the effect and the event handlers can both reuse it without
  // tripping the "setState synchronously in an effect" rule.
  async function fetchRules(): Promise<MerchantRule[]> {
    const res = await fetch("/api/merchant-rules")
    if (!res.ok) throw new Error("could not load merchant rules")
    return (await res.json()) as MerchantRule[]
  }

  async function refresh() {
    try {
      setRules(await fetchRules())
    } catch {
      // Keep the current list on a transient read failure.
    }
  }

  useEffect(() => {
    let ignore = false
    async function loadInitial() {
      try {
        const data = await fetchRules()
        if (!ignore) setRules(data)
      } catch {
        // Leave the list empty; the empty state renders.
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void loadInitial()
    return () => {
      ignore = true
    }
  }, [])

  async function addRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/merchant-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant, flatType }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? "Couldn’t add the rule")
        return
      }
      setMerchant("")
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function deleteRule(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/merchant-rules/${id}`, { method: "DELETE" })
      if (res.ok) await refresh()
      else setError("Couldn’t delete the rule")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <h2 className="text-lg font-medium">Merchant rules</h2>

      <form onSubmit={addRule} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="rule-merchant" className="text-sm text-muted-foreground">
            Merchant
          </label>
          <input
            id="rule-merchant"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            required
            className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="rule-type" className="text-sm text-muted-foreground">
            Type
          </label>
          <select
            id="rule-type"
            value={flatType}
            onChange={(event) => setFlatType(event.target.value as RealType)}
            className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-border px-3 py-1 text-sm font-medium"
        >
          Add
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rules yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="font-medium">{rule.merchant}</span> → {describeRule(rule)}
              </span>
              <button
                type="button"
                onClick={() => void deleteRule(rule.id)}
                disabled={busy}
                className="text-muted-foreground underline underline-offset-2"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
