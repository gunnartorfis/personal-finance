"use client"

import { useState } from "react"

import { clearOwnShare, setOwnShare } from "@/lib/transactions/share-client"
import { cn } from "@/lib/utils"

/**
 * Inline control to mark a debit as a Shared expense — the Household fronted one charge for several
 * parties and only bears its Own share (ADR-0014). Only the Own share counts as Spending; the rest
 * drops from all math like the fronted-for-others part of Excluded. The row always displays the full
 * charge; this control sets/edits/clears the share.
 *
 * Fully controlled like <ExcludeControl>: `ownShareAmount` is the source of truth and `onChanged`
 * fires after a successful save so the parent can update it. Only transient UI state (the draft
 * fields, saving/error flags) is local. `amount` is the full charged amount (negative); the share is
 * a negative integer with `amount <= ownShareAmount < 0`.
 *
 * Pre-i18n like its siblings (transactions is slice 5 of the i18n rollout): strings are English and
 * amounts use the `formatAmount` passed down from the table's formatter.
 */
export function ShareControl({
  transactionId,
  amount,
  ownShareAmount,
  formatAmount,
  onChanged,
  className,
}: {
  transactionId: string
  amount: number
  ownShareAmount: number | null
  formatAmount: (amount: number) => string
  onChanged?: (ownShareAmount: number | null) => void
  className?: string
}) {
  const [saving, setSaving] = useState(false)
  const [errored, setErrored] = useState(false)
  const [editing, setEditing] = useState(false)
  // Drafts are magnitudes (positive), matching how a user thinks about "my share is 28,571".
  const [shareDraft, setShareDraft] = useState("")
  const [waysDraft, setWaysDraft] = useState("")

  // The charge magnitude the share must stay within (amount is negative).
  const chargeMagnitude = -amount

  function openEditor(initialShare: number | null) {
    setShareDraft(initialShare === null ? "" : String(-initialShare))
    setWaysDraft("")
    setErrored(false)
    setEditing(true)
  }

  function closeEditor() {
    setEditing(false)
    setShareDraft("")
    setWaysDraft("")
  }

  // Dividing evenly fills the share from a headcount (including you): 200,000 across 7 → 28,571.
  function applyWays(raw: string) {
    setWaysDraft(raw)
    const ways = Number(raw)
    if (Number.isInteger(ways) && ways >= 2) {
      setShareDraft(String(Math.round(chargeMagnitude / ways)))
    }
  }

  // The parsed, in-bounds share magnitude, or null when the draft isn't a usable value yet. A share
  // must be a real fraction of the charge: at least 1 and strictly less than the full charge — a
  // share equal to the charge counts identically to no split, so it's rejected (ADR-0014).
  const parsedShare = (() => {
    const value = Math.round(Number(shareDraft))
    if (!shareDraft.trim() || !Number.isFinite(value)) return null
    if (value < 1 || value >= chargeMagnitude) return null
    return value
  })()

  async function save() {
    if (parsedShare === null) return
    setSaving(true)
    setErrored(false)
    try {
      await setOwnShare(transactionId, -parsedShare)
      onChanged?.(-parsedShare)
      closeEditor()
    } catch {
      setErrored(true)
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    setSaving(true)
    setErrored(false)
    try {
      await clearOwnShare(transactionId)
      onChanged?.(null)
    } catch {
      setErrored(true)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form
        className={cn("flex flex-wrap items-center gap-2 text-sm", className)}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label className="sr-only" htmlFor={`share-amount-${transactionId}`}>
          Your share
        </label>
        <input
          id={`share-amount-${transactionId}`}
          name={`share-amount-${transactionId}`}
          type="number"
          inputMode="numeric"
          min={1}
          // Strictly less than the full charge (equal is a no-op), matching the parsedShare bound.
          max={chargeMagnitude - 1}
          value={shareDraft}
          onChange={(event) => setShareDraft(event.target.value)}
          placeholder={`Your share of ${formatAmount(amount)}`}
          autoFocus
          disabled={saving}
          className="h-7 w-40 min-w-0 rounded-md border border-input bg-input/20 px-2 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 max-sm:text-base/relaxed md:text-sm dark:bg-input/30"
        />
        <span className="text-muted-foreground">or split by</span>
        <label className="sr-only" htmlFor={`share-ways-${transactionId}`}>
          Split evenly between (including you)
        </label>
        <input
          id={`share-ways-${transactionId}`}
          name={`share-ways-${transactionId}`}
          type="number"
          inputMode="numeric"
          min={2}
          value={waysDraft}
          onChange={(event) => applyWays(event.target.value)}
          placeholder="e.g. 7"
          disabled={saving}
          className="h-7 w-16 min-w-0 rounded-md border border-input bg-input/20 px-2 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 max-sm:text-base/relaxed md:text-sm dark:bg-input/30"
        />
        <button
          type="submit"
          disabled={saving || parsedShare === null}
          className="rounded-md border border-border px-2 py-0.5 font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={closeEditor}
          disabled={saving}
          className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        {errored && (
          <span role="alert" className="text-destructive">
            Couldn’t save
          </span>
        )}
      </form>
    )
  }

  if (ownShareAmount !== null) {
    return (
      <div
        className={cn("flex flex-wrap items-center gap-2 text-sm", className)}
      >
        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Shared
        </span>
        <span className="text-muted-foreground tabular-nums">
          your share {formatAmount(ownShareAmount)}
        </span>
        <button
          type="button"
          onClick={() => openEditor(ownShareAmount)}
          disabled={saving}
          className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => void clear()}
          disabled={saving}
          className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
        >
          Clear
        </button>
        {errored && (
          <span role="alert" className="text-destructive">
            Couldn’t save
          </span>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => openEditor(null)}
      className={cn(
        "text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground",
        className
      )}
    >
      Split
    </button>
  )
}
