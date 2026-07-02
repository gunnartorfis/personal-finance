"use client"

import { useState } from "react"

import { markIncome, unmarkIncome } from "@/lib/transactions/income-client"
import { cn } from "@/lib/utils"

/**
 * Inline control to mark (or unmark) a credit as real income (ADR-0009). Unmarked credits — mostly
 * inter-account transfers, card-bill payments, and refunds — count for nothing in any calculation,
 * so this checkbox is the only way a positive amount enters Income / Difference.
 *
 * Fully controlled like <OverrideControl>: `incomeMarked` is the source of truth and `onChanged`
 * fires after a successful save so the parent can update it. Only saving/error state is local.
 */
export function IncomeToggle({
  transactionId,
  incomeMarked,
  onChanged,
  className,
}: {
  transactionId: string
  incomeMarked: boolean
  onChanged?: (incomeMarked: boolean) => void
  className?: string
}) {
  const [saving, setSaving] = useState(false)
  const [errored, setErrored] = useState(false)

  async function toggle(next: boolean) {
    setSaving(true)
    setErrored(false)
    try {
      await (next ? markIncome(transactionId) : unmarkIncome(transactionId))
      onChanged?.(next)
    } catch {
      setErrored(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      <span className="flex h-lh items-center">
        <span className="group inline-grid size-5 grid-cols-1 sm:size-4">
          <input
            id={`income-${transactionId}`}
            name={`income-${transactionId}`}
            type="checkbox"
            checked={incomeMarked}
            disabled={saving}
            onChange={(event) => void toggle(event.target.checked)}
            className="col-start-1 row-start-1 appearance-none rounded-sm border border-border bg-transparent checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 forced-colors:appearance-auto"
          />
          <svg
            viewBox="0 0 14 14"
            fill="none"
            className="pointer-events-none col-start-1 row-start-1 size-7/8 self-center justify-self-center stroke-primary-foreground group-not-has-checked:opacity-0"
          >
            <path
              d="M3 8L6 11L11 3.5"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
      <label
        htmlFor={`income-${transactionId}`}
        className="text-muted-foreground"
      >
        Income
      </label>
      {errored && (
        <span role="alert" className="text-destructive">
          Couldn’t save
        </span>
      )}
    </div>
  )
}
