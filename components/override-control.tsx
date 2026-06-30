"use client"

import { useState } from "react"

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
 * wins wherever the type is read (e.g. the dashboard). `onChanged` lets a parent refresh its data.
 */
export function OverrideControl({
  transactionId,
  value,
  hasOverride: initialHasOverride,
  onChanged,
  className,
}: {
  transactionId: string
  value: ExpenseType
  hasOverride: boolean
  onChanged?: (next: { expenseType: ExpenseType; hasOverride: boolean }) => void
  className?: string
}) {
  const [selected, setSelected] = useState<ExpenseType>(value)
  const [hasOverride, setHasOverride] = useState(initialHasOverride)
  const [saving, setSaving] = useState(false)
  const [errored, setErrored] = useState(false)

  const endpoint = `/api/transactions/${transactionId}/override`

  async function setOverride(expenseType: ExpenseType) {
    setSelected(expenseType)
    setSaving(true)
    setErrored(false)
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseType }),
      })
      if (!res.ok) throw new Error(`override ${res.status}`)
      setHasOverride(true)
      onChanged?.({ expenseType, hasOverride: true })
    } catch {
      setErrored(true)
    } finally {
      setSaving(false)
    }
  }

  async function clearOverride() {
    setSaving(true)
    setErrored(false)
    try {
      const res = await fetch(endpoint, { method: "DELETE" })
      if (!res.ok) throw new Error(`override ${res.status}`)
      setHasOverride(false)
      onChanged?.({ expenseType: selected, hasOverride: false })
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
        value={selected}
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
          onClick={() => void clearOverride()}
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
