"use client"

import { CircleAlert, Loader2, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
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

/**
 * A failed mutation, kept as a translation key or a raw server message (the API owns duplicate /
 * validation copy). Stored keyed so the alert re-translates on a locale change.
 */
type RuleError = { key: "add" | "delete" } | { message: string }

// Pure fetch (no setState) so the effect and the event handlers can both reuse it without
// tripping the "setState synchronously in an effect" rule.
async function fetchRules(): Promise<MerchantRule[]> {
  const res = await fetch("/api/merchant-rules")
  if (!res.ok) throw new Error("could not load merchant rules")
  return (await res.json()) as MerchantRule[]
}

/**
 * Manage the current Household's merchant rules (Phase F): list them with delete, and an add form
 * for flat rules (merchant → type). Split rules created via the API are shown read-only. Each
 * mutation refetches so the list reflects server state.
 */
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent concerns (list-load, form inputs, add/delete mutations), not one cohesive state machine
export function MerchantRulesManager({ className }: { className?: string }) {
  const t = useTranslations("rules")
  const [rules, setRules] = useState<MerchantRule[]>([])
  const [loading, setLoading] = useState(true)
  const [merchant, setMerchant] = useState("")
  // A flat rule only offers the actionable types — never `""` (the not-bucketed / split type).
  const [flatType, setFlatType] = useState<RealType>("Fixed")
  const [error, setError] = useState<RuleError | null>(null)

  // Localized label for a canonical expense type. Switch over known values (no catch-all) so a new
  // enum member is a type error here rather than a silent English fallback.
  function typeLabel(type: ExpenseType): string {
    switch (type) {
      case "Fixed":
        return t("types.fixed")
      case "Necessary":
        return t("types.necessary")
      case "Nice to have":
        return t("types.niceToHave")
      case "":
        return t("types.splitNone")
    }
  }

  // A rule's effect — a flat type, or a split by charge magnitude.
  function describeRule(rule: MerchantRule): string {
    if (rule.flatType !== null) return typeLabel(rule.flatType)
    return t("split", {
      threshold: rule.threshold ?? 0,
      atOrAbove: typeLabel(rule.atOrAboveType ?? ""),
      below: typeLabel(rule.belowType ?? ""),
    })
  }
  // Track the two mutations separately so each spinner reflects its own action; a derived `busy`
  // still locks everything to one mutation at a time.
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const busy = adding || deletingId !== null

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
        const data = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        setError(data?.error ? { message: data.error } : { key: "add" })
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
      else setError({ key: "delete" })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section
      aria-label={t("regionLabel")}
      className={cn("flex flex-col gap-6", className)}
    >
      <form
        onSubmit={addRule}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="rule-merchant" className="text-sm font-medium">
            {t("merchantLabel")}
          </label>
          <Input
            id="rule-merchant"
            name="merchant"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            required
            placeholder={t("merchantPlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <label htmlFor="rule-type" className="text-sm font-medium">
            {t("typeFieldLabel")}
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
                  {typeLabel(type)}
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
          {t("add")}
        </Button>
      </form>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            {"message" in error
              ? error.message
              : error.key === "add"
                ? t("addError")
                : t("deleteError")}
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{rule.merchant}</span>
                <span className="truncate text-muted-foreground">
                  {describeRule(rule)}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t("deleteAria", { merchant: rule.merchant })}
                onClick={() => void deleteRule(rule.id)}
                disabled={busy}
              >
                {deletingId === rule.id ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
                {t("delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
