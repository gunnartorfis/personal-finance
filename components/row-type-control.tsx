"use client"

import {
  Ban,
  Check,
  ChevronDown,
  Loader2,
  Sparkles,
  Split,
  Undo2,
} from "lucide-react"
import { useRef, useState } from "react"

import type { TransactionRow } from "@/components/transactions-table"
import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { clearOverride, putOverride } from "@/lib/overrides/client"
import {
  excludeTransaction,
  includeTransaction,
} from "@/lib/transactions/exclude-client"
import { markIncome, unmarkIncome } from "@/lib/transactions/income-client"
import { clearOwnShare, setOwnShare } from "@/lib/transactions/share-client"
import { cn } from "@/lib/utils"
import { EXPENSE_TYPES, type ExpenseType } from "@/shared/types"

/** Matches the DB cap on `exclusion_note`; the input can't exceed what the API accepts. */
const MAX_NOTE_LENGTH = 280

/**
 * Per-type label + swatch, drawn from the same hues the charts use ({@link CATEGORIES} in
 * `spending-by-type`) so the pill, the menu radios, and the breakdown chart never drift. `""` is the
 * not-bucketed / split type shown as "Split / none".
 */
const TYPE_META: Record<ExpenseType, { label: string; dot: string }> = {
  Fixed: { label: "Fixed", dot: "bg-emerald-500" },
  Necessary: { label: "Necessary", dot: "bg-amber-500" },
  "Nice to have": { label: "Nice to have", dot: "bg-rose-500" },
  "": { label: "Split / none", dot: "bg-zinc-400 dark:bg-zinc-500" },
}

/** A small colored status dot used inside the pill and the type radios. */
function Dot({ className }: { className?: string }) {
  return <span className={cn("size-1.5 shrink-0 rounded-full", className)} aria-hidden />
}

/** The collapsed pill shape — a compact outline button that opens the row's action menu. */
function pillButton(className?: string) {
  return (
    <Button
      variant="outline"
      size="default"
      className={cn("font-medium", className)}
    />
  )
}

/**
 * The single inline control that owns a transaction row's "Type" cell (Phase H redesign). It
 * collapses what used to be a row of competing links — the type dropdown, Reset, the "apply to all"
 * nudge, Exclude, and Split — into one color-keyed **type pill** that opens a menu holding every
 * action for that row. The two actions that need input (Split, Exclude) swap an inline editor into
 * the cell rather than crowding the collapsed state.
 *
 * Three shapes, matching the table's display logic:
 * - **Debit**: the pill shows the effective type (`overrideType ?? classifiedType`), or "Needs
 *   review" while unclassified; the menu picks a type, resets to the AI suggestion, offers a
 *   whole-merchant rule (ADR-0012), splits (ADR-0014), or excludes (ADR-0011).
 * - **Credit**: never an expense — the pill reads "Income"/"Credit" and the menu's sole lever is the
 *   income checkbox (ADR-0009).
 * - **Excluded**: a muted pill with any reason, and a menu that only re-includes it.
 *
 * Each action persists via the shared client helpers and, on success, calls the matching `onChanged`
 * so the parent updates the row locally and refreshes the server-derived summary. Transient
 * saving/error and the rule-shortcut status are local.
 */
export function RowTypeControl({
  row,
  formatAmount,
  onOverrideChanged,
  onIncomeChanged,
  onExcludeChanged,
  onShareChanged,
}: {
  row: TransactionRow
  formatAmount: (amount: number) => string
  onOverrideChanged: (next: {
    expenseType: ExpenseType | null
    hasOverride: boolean
  }) => void
  onIncomeChanged: (incomeMarked: boolean) => void
  onExcludeChanged: (next: { excluded: boolean; note: string | null }) => void
  onShareChanged: (ownShareAmount: number | null) => void
}) {
  const [editor, setEditor] = useState<"none" | "split" | "exclude">("none")
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)

  // Run an async persist, disabling the trigger meanwhile and surfacing a single inline error.
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setErrored(false)
    try {
      await action()
    } catch {
      setErrored(true)
    } finally {
      setBusy(false)
    }
  }

  const errorSlot = errored ? (
    <span role="alert" className="text-xs text-destructive">
      Couldn’t save
    </span>
  ) : null

  // --- Excluded: count for nothing; only Include applies (ADR-0011). ---
  if (row.excluded) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Menu>
          <MenuTrigger
            render={pillButton(
              "border-dashed text-muted-foreground line-through decoration-1"
            )}
            disabled={busy}
          >
            <Dot className="bg-muted-foreground/40" />
            Excluded
            <ChevronDown className="opacity-60" aria-hidden />
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              onClick={() =>
                void run(async () => {
                  await includeTransaction(row.id)
                  onExcludeChanged({ excluded: false, note: null })
                })
              }
            >
              <Undo2 />
              Include in calculations
            </MenuItem>
          </MenuContent>
        </Menu>
        {row.exclusionNote && (
          <span
            className="max-w-40 truncate text-xs text-muted-foreground italic"
            title={row.exclusionNote}
          >
            “{row.exclusionNote}”
          </span>
        )}
        {errorSlot}
      </div>
    )
  }

  // --- Credit: never an expense; the income checkbox is the only lever (ADR-0009). ---
  if (row.amount > 0) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Menu>
          <MenuTrigger
            render={pillButton(
              row.incomeMarked
                ? "border-emerald-600/30 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-400"
                : "text-muted-foreground"
            )}
            disabled={busy}
          >
            <Dot
              className={
                row.incomeMarked ? "bg-emerald-500" : "bg-muted-foreground/40"
              }
            />
            {row.incomeMarked ? "Income" : "Credit"}
            <ChevronDown className="opacity-60" aria-hidden />
          </MenuTrigger>
          <MenuContent>
            <MenuCheckboxItem
              checked={row.incomeMarked}
              onCheckedChange={(checked) =>
                void run(async () => {
                  await (checked ? markIncome(row.id) : unmarkIncome(row.id))
                  onIncomeChanged(checked)
                })
              }
            >
              Count as income
            </MenuCheckboxItem>
          </MenuContent>
        </Menu>
        {errorSlot}
      </div>
    )
  }

  // --- Debit: the common case — a typed expense with the full action set. ---
  const effective: ExpenseType =
    row.overrideType ?? row.classifiedType ?? ""
  const hasOverride = row.overrideType !== null
  // A pending/failed row has no real type yet: show "Needs review", not a stand-in "Split / none".
  const unclassified =
    row.classificationStatus !== "classified" && row.overrideType === null
  const shared = row.ownShareAmount !== null
  // Offer the whole-merchant rule only for a real (non-split) type keyed on a known merchant.
  const canMakeRule = !unclassified && effective !== "" && row.merchant.trim() !== ""

  if (editor === "split") {
    return (
      <SplitEditor
        transactionId={row.id}
        amount={row.amount}
        initialShare={row.ownShareAmount}
        formatAmount={formatAmount}
        onDone={(share) => {
          if (share !== null) onShareChanged(share)
          setEditor("none")
        }}
        onCancel={() => setEditor("none")}
      />
    )
  }

  if (editor === "exclude") {
    return (
      <ExcludeEditor
        transactionId={row.id}
        onDone={(note) => {
          onExcludeChanged({ excluded: true, note })
          setEditor("none")
        }}
        onCancel={() => setEditor("none")}
      />
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Menu>
        <MenuTrigger
          render={pillButton(unclassified ? "border-dashed" : undefined)}
          disabled={busy}
          title={
            unclassified
              ? row.classificationStatus === "failed"
                ? "Classification failed — pick a type"
                : "Awaiting classification — pick a type"
              : undefined
          }
        >
          {unclassified ? (
            <Dot className="bg-muted-foreground/40" />
          ) : (
            <Dot className={TYPE_META[effective].dot} />
          )}
          {unclassified ? "Needs review" : TYPE_META[effective].label}
          <ChevronDown className="opacity-60" aria-hidden />
        </MenuTrigger>
        <MenuContent className="min-w-56">
          <MenuGroup>
            <MenuGroupLabel>Set type</MenuGroupLabel>
            <MenuRadioGroup
              value={unclassified ? undefined : effective}
              onValueChange={(value) =>
                void run(async () => {
                  await putOverride(row.id, value as ExpenseType)
                  onOverrideChanged({
                    expenseType: value as ExpenseType,
                    hasOverride: true,
                  })
                })
              }
            >
              {EXPENSE_TYPES.map((type) => (
                <MenuRadioItem key={type} value={type}>
                  <Dot className={TYPE_META[type].dot} />
                  <span className="flex-1">{TYPE_META[type].label}</span>
                  {row.classifiedType === type && !unclassified && (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                      title="AI suggestion"
                    >
                      <Sparkles className="size-3" aria-hidden />
                      AI
                    </span>
                  )}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>

          {(hasOverride || canMakeRule) && <MenuSeparator />}
          {hasOverride && (
            <MenuItem
              onClick={() =>
                void run(async () => {
                  await clearOverride(row.id)
                  onOverrideChanged({ expenseType: null, hasOverride: false })
                })
              }
            >
              <Undo2 />
              {row.classifiedType !== null
                ? `Reset to AI · ${TYPE_META[row.classifiedType].label}`
                : "Reset to AI suggestion"}
            </MenuItem>
          )}
          {canMakeRule && (
            <ApplyToAllItem merchant={row.merchant} flatType={effective} />
          )}

          <MenuSeparator />
          <MenuItem onClick={() => setEditor("split")}>
            <Split />
            {shared ? "Edit split…" : "Split charge…"}
          </MenuItem>
          {shared && (
            <MenuItem
              onClick={() =>
                void run(async () => {
                  await clearOwnShare(row.id)
                  onShareChanged(null)
                })
              }
            >
              <Undo2 />
              Remove split
            </MenuItem>
          )}
          <MenuItem
            onClick={() => setEditor("exclude")}
            className="text-destructive data-[highlighted]:text-destructive"
          >
            <Ban />
            Exclude…
          </MenuItem>
        </MenuContent>
      </Menu>

      {shared && (
        <span className="inline-flex items-center rounded-full border border-border px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
          Shared
        </span>
      )}
      {errorSlot}
    </div>
  )
}

/** Outcome of the "apply to all" rule shortcut — drives the item's inline feedback. */
type RuleStatus = "idle" | "creating" | "created" | "exists" | "error"

/**
 * Menu item that turns the row's type into a whole-merchant rule (ADR-0012): an Override fixes only
 * this row, a rule re-types every matching row and future charges. `POST`s `/api/merchant-rules`; a
 * 409 means one already exists. Stays open on click (`closeOnClick={false}`) so its result shows in
 * place instead of vanishing with the menu.
 */
function ApplyToAllItem({
  merchant,
  flatType,
}: {
  merchant: string
  flatType: ExpenseType
}) {
  const [status, setStatus] = useState<RuleStatus>("idle")
  const req = useRef(0)

  async function create() {
    const token = (req.current += 1)
    setStatus("creating")
    try {
      const res = await fetch("/api/merchant-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant, flatType }),
      })
      if (req.current !== token) return
      setStatus(res.ok ? "created" : res.status === 409 ? "exists" : "error")
    } catch {
      if (req.current === token) setStatus("error")
    }
  }

  if (status === "created" || status === "exists") {
    return (
      <MenuItem disabled className="text-muted-foreground">
        <Check className="text-emerald-600" />
        {status === "created"
          ? `Rule added for ${merchant}`
          : `Rule already exists for ${merchant}`}
      </MenuItem>
    )
  }

  return (
    <MenuItem
      closeOnClick={false}
      disabled={status === "creating"}
      onClick={() => void create()}
    >
      {status === "creating" ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Sparkles />
      )}
      {status === "error" ? "Couldn’t add — retry" : `Apply to all ${merchant}`}
    </MenuItem>
  )
}

/**
 * Inline editor for a Shared expense (ADR-0014): enter your own share, or fill it by dividing the
 * charge evenly by a headcount. The share is a positive magnitude, at least 1 and strictly less than
 * the full charge (equal is a no-op). Persists via {@link setOwnShare} and reports the signed share.
 */
function SplitEditor({
  transactionId,
  amount,
  initialShare,
  formatAmount,
  onDone,
  onCancel,
}: {
  transactionId: string
  amount: number
  initialShare: number | null
  formatAmount: (amount: number) => string
  onDone: (ownShareAmount: number | null) => void
  onCancel: () => void
}) {
  const chargeMagnitude = -amount
  const [shareDraft, setShareDraft] = useState(
    initialShare === null ? "" : String(-initialShare)
  )
  const [waysDraft, setWaysDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [errored, setErrored] = useState(false)

  function applyWays(raw: string) {
    setWaysDraft(raw)
    const ways = Number(raw)
    if (Number.isInteger(ways) && ways >= 2) {
      setShareDraft(String(Math.round(chargeMagnitude / ways)))
    }
  }

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
      onDone(-parsedShare)
    } catch {
      setErrored(true)
      setSaving(false)
    }
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
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
      <Button type="submit" variant="outline" disabled={saving || parsedShare === null}>
        Save
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={saving}
        className="text-muted-foreground"
      >
        Cancel
      </Button>
      {errored && (
        <span role="alert" className="text-destructive">
          Couldn’t save
        </span>
      )}
    </form>
  )
}

/**
 * Inline editor to exclude a debit from every calculation (ADR-0011) with an optional reason.
 * Persists via {@link excludeTransaction} and reports the saved note.
 */
function ExcludeEditor({
  transactionId,
  onDone,
  onCancel,
}: {
  transactionId: string
  onDone: (note: string | null) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [errored, setErrored] = useState(false)

  async function submit() {
    setSaving(true)
    setErrored(false)
    const trimmed = draft.trim()
    try {
      await excludeTransaction(transactionId, trimmed || undefined)
      onDone(trimmed || null)
    } catch {
      setErrored(true)
      setSaving(false)
    }
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
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
      <Button type="submit" variant="outline" disabled={saving}>
        Exclude
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={saving}
        className="text-muted-foreground"
      >
        Cancel
      </Button>
      {errored && (
        <span role="alert" className="text-destructive">
          Couldn’t save
        </span>
      )}
    </form>
  )
}
