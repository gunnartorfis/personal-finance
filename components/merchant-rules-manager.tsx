"use client"

import { CircleAlert, Loader2, Plus, Trash2 } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  // Track the two mutations separately so each spinner reflects its own action; a derived `busy`
  // still locks everything to one mutation at a time.
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const busy = adding || deletingId !== null

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
    setAdding(true)
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
      setAdding(false)
    }
  }

  async function deleteRule(id: string) {
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/merchant-rules/${id}`, { method: "DELETE" })
      if (res.ok) await refresh()
      else setError("Couldn’t delete the rule")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section aria-label="Merchant rules" className={cn("flex flex-col gap-6", className)}>
      <form
        onSubmit={addRule}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="rule-merchant" className="text-sm font-medium">
            Merchant
          </label>
          <Input
            id="rule-merchant"
            name="merchant"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            required
            placeholder="e.g. NETFLIX"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <label htmlFor="rule-type" className="text-sm font-medium">
            Type
          </label>
          <div className="grid grid-cols-[1fr_--spacing(7)] items-center rounded-md border border-input bg-input/20 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30">
            <select
              id="rule-type"
              name="flatType"
              value={flatType}
              onChange={(event) => setFlatType(event.target.value as RealType)}
              className="col-span-full row-start-1 h-7 appearance-none bg-transparent py-0.5 pr-7 pl-2 text-sm outline-none"
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {LABELS[type]}
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
        <Button type="submit" disabled={busy}>
          {adding ? <Loader2 className="animate-spin" /> : <Plus />}
          Add
        </Button>
      </form>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No rules yet.
        </div>
      ) : (
        <ul
          role="list"
          className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card"
        >
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{rule.merchant}</span>
                <span className="truncate text-muted-foreground">{describeRule(rule)}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Delete rule for ${rule.merchant}`}
                onClick={() => void deleteRule(rule.id)}
                disabled={busy}
              >
                {deletingId === rule.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
