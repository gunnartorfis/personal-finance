"use client"

import { useTranslations } from "next-intl"
import { useEffect, useEffectEvent, useRef, useState } from "react"

import type { TransactionRow } from "@/components/transactions-table"
import { putOverride } from "@/lib/overrides/client"
import type { ExpenseType } from "@/shared/types"

export type BulkTypeResult = { saved: number; failed: number }

function canRetype(row: TransactionRow) {
  return row.amount <= 0 && !row.excluded && !row.transferGroupId && !row.sharedTransferRuleApplies
}

async function saveExpenseTypes(rows: TransactionRow[], type: ExpenseType) {
  const pending = rows.values()
  const saved = new Set<string>()

  // Each worker takes the next row after its request settles, with at most five requests in flight.
  async function saveNext(): Promise<void> {
    const next = pending.next()
    if (next.done) return
    const { id } = next.value
    try {
      await putOverride(id, type)
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
  onSaved: (ids: Set<string>, type: ExpenseType) => void
) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const selectionAnchor = useRef<string | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const selectionBarRef = useRef<HTMLDivElement>(null)
  const [savingTypes, setSavingTypes] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkTypeResult | null>(null)
  const selectedRows = visible.filter((row) => selectedIds.has(row.id))
  const hasSelection = selectedRows.length > 0
  const retypable = selectedRows.filter(canRetype)
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

  async function changeSelectedType(expenseType: ExpenseType) {
    if (savingTypes || retypable.length === 0) return
    setSavingTypes(true)
    setBulkResult(null)

    const saved = await saveExpenseTypes(retypable, expenseType)

    if (saved.size > 0) {
      if (saved.size === selectedRows.length && selectionBarRef.current?.contains(document.activeElement)) {
        selectAllRef.current?.focus({ preventScroll: true })
      }
      if (selectionAnchor.current && saved.has(selectionAnchor.current)) selectionAnchor.current = null
      setSelectedIds((current) => new Set([...current].filter((id) => !saved.has(id))))
      onSaved(saved, expenseType)
    }
    setBulkResult({ saved: saved.size, failed: retypable.length - saved.size })
    setSavingTypes(false)
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

  return {
    sectionRef, selectionBarRef, selectAllRef, selectedIds, selectedCount: selectedRows.length,
    retypableCount: retypable.length, allSelected, savingTypes, bulkResult, clearSelection,
    toggleSelection, toggleAll, changeSelectedType,
  }
}

export function BulkTypeFeedback({ result }: { result: BulkTypeResult | null }) {
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
  result: BulkTypeResult | null
}) {
  const t = useTranslations("transactions")
  return (
    <div className="rounded-t-lg border-b border-border px-3">
      <p aria-live="polite" className="flex min-h-12 items-center text-sm text-muted-foreground tabular-nums">
        {totalCount === undefined
          ? t("tableCount", { count: visibleCount })
          : t("showingCount", { visible: visibleCount, total: totalCount })}
      </p>
      <BulkTypeFeedback result={result} />
    </div>
  )
}
