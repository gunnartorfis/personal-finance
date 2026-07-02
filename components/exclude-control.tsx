"use client"

import { useState } from "react"

import {
  excludeTransaction,
  includeTransaction,
} from "@/lib/transactions/exclude-client"
import { cn } from "@/lib/utils"

/** Matches the DB cap on `exclusion_note`; the input can't exceed what the API accepts. */
const MAX_NOTE_LENGTH = 280

/**
 * Inline control to exclude a Transaction from every calculation, or re-include it (ADR-0011).
 * Excluding a debit is the only way it leaves Spending; excluding also clears any income mark.
 *
 * Fully controlled like <IncomeToggle>: `excluded`/`note` are the source of truth and `onChanged`
 * fires after a successful save so the parent can update them. Only transient UI state (the reason
 * draft, saving/error flags) is local. Excluding opens a small inline form for an optional reason;
 * an excluded row shows an "Excluded" badge, the reason, and an Include action to revert.
 */
export function ExcludeControl({
  transactionId,
  excluded,
  note,
  onChanged,
  className,
}: {
  transactionId: string
  excluded: boolean
  note: string | null
  onChanged?: (next: { excluded: boolean; note: string | null }) => void
  className?: string
}) {
  const [saving, setSaving] = useState(false)
  const [errored, setErrored] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  async function exclude(reason: string) {
    setSaving(true)
    setErrored(false)
    const trimmed = reason.trim()
    try {
      await excludeTransaction(transactionId, trimmed || undefined)
      onChanged?.({ excluded: true, note: trimmed || null })
      setEditing(false)
      setDraft("")
    } catch {
      setErrored(true)
    } finally {
      setSaving(false)
    }
  }

  async function include() {
    setSaving(true)
    setErrored(false)
    try {
      await includeTransaction(transactionId)
      onChanged?.({ excluded: false, note: null })
    } catch {
      setErrored(true)
    } finally {
      setSaving(false)
    }
  }

  if (excluded) {
    return (
      <div
        className={cn("flex flex-wrap items-center gap-2 text-sm", className)}
      >
        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Excluded
        </span>
        {note && (
          <span className="text-muted-foreground italic" title={note}>
            “{note}”
          </span>
        )}
        <button
          type="button"
          onClick={() => void include()}
          disabled={saving}
          className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
        >
          Include
        </button>
        {errored && (
          <span role="alert" className="text-destructive">
            Couldn’t save
          </span>
        )}
      </div>
    )
  }

  if (editing) {
    return (
      <form
        className={cn("flex flex-wrap items-center gap-2 text-sm", className)}
        onSubmit={(event) => {
          event.preventDefault()
          void exclude(draft)
        }}
      >
        <label className="sr-only" htmlFor={`exclude-note-${transactionId}`}>
          Reason for excluding (optional)
        </label>
        <input
          id={`exclude-note-${transactionId}`}
          name={`exclude-note-${transactionId}`}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Reason (optional)"
          autoFocus
          disabled={saving}
          className="h-7 min-w-0 flex-1 rounded-md border border-input bg-input/20 px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 max-sm:text-base/relaxed md:text-sm dark:bg-input/30"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md border border-border px-2 py-0.5 font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          Exclude
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false)
            setDraft("")
          }}
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

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground",
        className
      )}
    >
      Exclude
    </button>
  )
}
