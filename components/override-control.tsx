"use client"

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

/**
 * Inline control to manually set or clear a transaction's expense-type override (Phase F). Picking
 * a type `PUT`s the override; "Reset" `DELETE`s it, reverting to the classified type. The override
 * wins wherever the type is read (e.g. the dashboard).
 *
 * Fully controlled: `value`/`hasOverride` are the source of truth (the dropdown always reflects the
 * prop, never a stale local copy). After a successful change `onChanged` fires so the parent can
 * update those props / refetch — on a clear, `expenseType` is null because the reverted classified
 * type isn't known here. Only the transient saving/error state is local.
 */
export function OverrideControl({
  transactionId,
  value,
  hasOverride,
  onChanged,
  className,
}: {
  transactionId: string
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

  async function setOverride(expenseType: ExpenseType) {
    setSaving(true)
    setErrored(false)
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
    try {
      await clearOverride(transactionId)
      onChanged?.({ expenseType: null, hasOverride: false })
    } catch {
      setErrored(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label className="sr-only" htmlFor={`override-${transactionId}`}>
        Expense type
      </label>
      <select
        id={`override-${transactionId}`}
        value={value}
        disabled={saving}
        onChange={(event) =>
          void setOverride(event.target.value as ExpenseType)
        }
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
  )
}
