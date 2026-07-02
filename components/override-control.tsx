"use client"

import { Check, Loader2, Sparkles } from "lucide-react"
import { useState } from "react"

import { clearOverride, putOverride } from "@/lib/overrides/client"
import { cn } from "@/lib/utils"
import { EXPENSE_TYPES, type ExpenseType } from "@/shared/types"

/** Human labels for the expense types; `""` is the not-bucketed / split type. */
const LABELS: Record<ExpenseType, string> = {
  Fixed: "Fixed",
  Necessary: "Necessary",
  "Nice to have": "Nice to have",
  "": "Split / none",
}

/** Outcome of the "apply to all" rule shortcut — drives the nudge's inline feedback. */
type RuleStatus = "idle" | "creating" | "created" | "exists" | "error"

/**
 * Inline control to manually set or clear a transaction's expense-type override (Phase F). Picking
 * a type `PUT`s the override; "Reset" `DELETE`s it, reverting to the classified type. The override
 * wins wherever the type is read (e.g. the dashboard).
 *
 * Once a row carries an override of a real type, a nudge offers to turn that one-off correction into
 * a **Merchant rule** for the whole merchant (an Override only fixes this row; a rule re-types every
 * matching row and future charges — ADR-0012). It `POST`s `/api/merchant-rules`; a 409 means a rule
 * already exists.
 *
 * Fully controlled: `value`/`hasOverride` are the source of truth (the dropdown always reflects the
 * prop, never a stale local copy). After a successful change `onChanged` fires so the parent can
 * update those props / refetch — on a clear, `expenseType` is null because the reverted classified
 * type isn't known here. Only the transient saving/error/nudge state is local.
 */
export function OverrideControl({
  transactionId,
  merchant,
  value,
  hasOverride,
  onChanged,
  className,
}: {
  transactionId: string
  merchant: string
  value: ExpenseType
  hasOverride: boolean
  onChanged?: (next: {
    expenseType: ExpenseType | null
    hasOverride: boolean
  }) => void
  className?: string
}) {
  const [saving, setSaving] = useState(false)
  const [errored, setErrored] = useState(false)
  const [ruleStatus, setRuleStatus] = useState<RuleStatus>("idle")

  async function setOverride(expenseType: ExpenseType) {
    setSaving(true)
    setErrored(false)
    setRuleStatus("idle") // a new choice gets its own fresh rule offer
    try {
      await putOverride(transactionId, expenseType)
      onChanged?.({ expenseType, hasOverride: true })
    } catch {
      setErrored(true)
    } finally {
      setSaving(false)
    }
  }

  async function resetOverride() {
    setSaving(true)
    setErrored(false)
    setRuleStatus("idle")
    try {
      await clearOverride(transactionId)
      onChanged?.({ expenseType: null, hasOverride: false })
    } catch {
      setErrored(true)
    } finally {
      setSaving(false)
    }
  }

  async function createRule() {
    if (value === "") return // no rule for the split / none type
    setRuleStatus("creating")
    try {
      const res = await fetch("/api/merchant-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant, flatType: value }),
      })
      setRuleStatus(res.ok ? "created" : res.status === 409 ? "exists" : "error")
    } catch {
      setRuleStatus("error")
    }
  }

  // Offer the rule shortcut only once a real-typed override is in place — never on the default row
  // or for the not-bucketed / split type.
  const showNudge = hasOverride && value !== ""

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`override-${transactionId}`}>
          Expense type
        </label>
        <select
          id={`override-${transactionId}`}
          value={value}
          disabled={saving}
          onChange={(event) => void setOverride(event.target.value as ExpenseType)}
          className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
        >
          {EXPENSE_TYPES.map((type) => (
            <option key={type} value={type}>
              {LABELS[type]}
            </option>
          ))}
        </select>
        {hasOverride && (
          <button
            type="button"
            onClick={() => void resetOverride()}
            disabled={saving}
            className="text-sm text-muted-foreground underline underline-offset-2"
          >
            Reset
          </button>
        )}
        {errored && (
          <span role="alert" className="text-sm text-destructive">
            Couldn’t save
          </span>
        )}
      </div>

      {showNudge && (
        <div className="flex items-center gap-1.5 text-sm">
          {ruleStatus === "created" ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Check aria-hidden="true" className="size-4 h-lh shrink-0 text-emerald-600" />
              Rule added — future {merchant} charges auto-classify.
            </span>
          ) : ruleStatus === "exists" ? (
            <span className="text-muted-foreground">
              A rule already exists for {merchant}.
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void createRule()}
                disabled={ruleStatus === "creating"}
                className="inline-flex items-center gap-1.5 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-70"
              >
                {ruleStatus === "creating" ? (
                  <Loader2 aria-hidden="true" className="size-4 h-lh shrink-0 animate-spin" />
                ) : (
                  <Sparkles aria-hidden="true" className="size-4 h-lh shrink-0" />
                )}
                Apply to all {merchant}
              </button>
              {ruleStatus === "error" && (
                <span role="alert" className="text-destructive">
                  Couldn’t add rule
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
