"use client"

import { useTranslations } from "next-intl"
import { useEffect, useEffectEvent, useRef, useState } from "react"

import type { TransactionRow } from "@/components/transactions-table"
import { useExpenseTypeLabels } from "@/lib/expense-type-labels"
import { clearOverride, putOverride } from "@/lib/overrides/client"
import { excludeTransaction, includeTransaction } from "@/lib/transactions/exclude-client"
import { markIncome, unmarkIncome } from "@/lib/transactions/income-client"
import { EXPENSE_TYPES } from "@/shared/types"

export type BulkUpdateResult = { saved: number; failed: number }

function canRetype(row: TransactionRow) {
  return row.amount <= 0 && !row.excluded && !row.transferGroupId && !row.sharedTransferRuleApplies
}

type PersistUpdate = (id: string) => Promise<void>

export type BulkTransactionUpdate = {
  id: string
  label: string
  rows: TransactionRow[]
  persist: PersistUpdate
  patch: Partial<TransactionRow>
}

async function saveTransactionUpdates(rows: TransactionRow[], persist: PersistUpdate) {
  const pending = rows.values()
  const saved = new Set<string>()

  // Each worker takes the next row after its request settles, with at most five requests in flight.
  async function saveNext(): Promise<void> {
    const next = pending.next()
    if (next.done) return
    const { id } = next.value
    try {
      await persist(id)
      saved.add(id)
    } catch {
      // Failed rows remain selected for retry.
    }
    await saveNext()
  }

  await Promise.all(Array.from({ length: Math.min(5, rows.length) }, saveNext))
  return saved
}

export function useTransactionSelection(
  visible: TransactionRow[],
  onSaved: (ids: Set<string>, patch: Partial<TransactionRow>) => void
) {
  const t = useTranslations("transactions")
  const rowLabel = useTranslations("rowType")
  const typeLabels = useExpenseTypeLabels()
  const sectionRef = useRef<HTMLDivElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const selectionAnchor = useRef<string | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const selectionBarRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkUpdateResult | null>(null)
  const selectedRows = visible.filter((row) => selectedIds.has(row.id))
  const hasSelection = selectedRows.length > 0
  const allSelected = visible.length > 0 && selectedRows.length === visible.length

  function clearSelection() {
    if (selectionBarRef.current?.contains(document.activeElement)) {
      selectAllRef.current?.focus({ preventScroll: true })
    }
    selectionAnchor.current = null
    setSelectedIds(new Set())
    setBulkResult(null)
  }

  function toggleSelection(id: string, range: boolean) {
    const anchorIndex = range ? visible.findIndex((row) => row.id === selectionAnchor.current) : -1
    const index = visible.findIndex((row) => row.id === id)
    const ids = anchorIndex < 0
      ? [id]
      : visible.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1).map((row) => row.id)

    if (anchorIndex < 0) selectionAnchor.current = id
    setBulkResult(null)
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const rowId of ids) {
        if (current.has(id)) next.delete(rowId)
        else next.add(rowId)
      }
      return next
    })
  }

  function toggleAll() {
    setBulkResult(null)
    selectionAnchor.current = null
    setSelectedIds(allSelected ? new Set() : new Set(visible.map((row) => row.id)))
  }

  async function updateSelected({ rows: eligible, persist, patch }: BulkTransactionUpdate) {
    if (saving || eligible.length === 0) return
    setSaving(true)
    setBulkResult(null)

    const saved = await saveTransactionUpdates(eligible, persist)

    if (saved.size > 0) {
      if (saved.size === selectedRows.length && selectionBarRef.current?.contains(document.activeElement)) {
        selectAllRef.current?.focus({ preventScroll: true })
      }
      if (selectionAnchor.current && saved.has(selectionAnchor.current)) selectionAnchor.current = null
      setSelectedIds((current) => new Set([...current].filter((id) => !saved.has(id))))
      onSaved(saved, patch)
    }
    setBulkResult({ saved: saved.size, failed: eligible.length - saved.size })
    setSaving(false)
  }

  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return
    const target = event.target
    if (!(target instanceof Element) || !sectionRef.current?.contains(target)) return
    if (!target.closest("input:not([type=checkbox]), select, textarea, [contenteditable]")) clearSelection()
  })

  useEffect(() => {
    if (!hasSelection) return
    const listener = (event: KeyboardEvent) => onEscape(event)
    // Handle Escape after the focused control has had a chance to consume it.
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [hasSelection])

  const updates: BulkTransactionUpdate[] = []
  function addUpdate(
    id: string,
    label: string,
    eligible: TransactionRow[],
    persist: PersistUpdate,
    patch: Partial<TransactionRow>
  ) {
    if (!saving && eligible.length > 0) {
      updates.push({ id, label, rows: eligible, persist, patch })
    }
  }

  const retypable = selectedRows.filter(canRetype)
  for (const type of EXPENSE_TYPES) {
    addUpdate(`type-${type}`, t("selection.setType", { type: typeLabels[type] }), retypable,
      (id) => putOverride(id, type), { overrideType: type })
  }
  addUpdate("reset", rowLabel("resetToAi"), retypable.filter((row) => row.overrideType !== null),
    clearOverride, { overrideType: null, overrideCategoryId: null })
  addUpdate("exclude", t("selection.exclude"), selectedRows.filter((row) => !row.excluded && !row.transferGroupId),
    excludeTransaction, { excluded: true, exclusionNote: null, incomeMarked: false, ownShareAmount: null })
  addUpdate("include", rowLabel("include"), selectedRows.filter((row) => row.excluded),
    includeTransaction, { excluded: false, exclusionNote: null })

  const credits = selectedRows.filter((row) => row.amount > 0 && !row.excluded && !row.transferGroupId)
  addUpdate("income", rowLabel("countAsIncome"), credits.filter((row) => !row.incomeMarked),
    markIncome, { incomeMarked: true })
  addUpdate("unmark-income", t("selection.unmarkIncome"), credits.filter((row) => row.incomeMarked),
    unmarkIncome, { incomeMarked: false })

  return {
    sectionRef, selectionBarRef, selectAllRef, selectedIds, selectedCount: selectedRows.length,
    updates, updateSelected, allSelected, saving, bulkResult, clearSelection, toggleSelection, toggleAll,
  }
}

export function BulkUpdateFeedback({ result }: { result: BulkUpdateResult | null }) {
  const t = useTranslations("transactions")
  return (
    <div aria-live="polite">
      {result && (
        <div className="space-y-0.5 py-2 text-sm">
          {result.saved > 0 && (
            <p className="text-muted-foreground">{t("selection.saved", { count: result.saved })}</p>
          )}
          {result.failed > 0 && (
            <p role="alert" className="text-destructive">{t("selection.failed", { count: result.failed })}</p>
          )}
        </div>
      )}
    </div>
  )
}

export function TransactionListStatus({
  visibleCount,
  totalCount,
  result,
}: {
  visibleCount: number
  totalCount?: number
  result: BulkUpdateResult | null
}) {
  const t = useTranslations("transactions")
  return (
    <div className="rounded-t-lg border-b border-border px-3">
      <p aria-live="polite" className="flex min-h-12 items-center text-sm text-muted-foreground tabular-nums">
        {totalCount === undefined
          ? t("tableCount", { count: visibleCount })
          : t("showingCount", { visible: visibleCount, total: totalCount })}
      </p>
      <BulkUpdateFeedback result={result} />
    </div>
  )
}
