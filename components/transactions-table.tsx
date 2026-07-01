"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { OverrideControl } from "@/components/override-control"
import { ReviewMode } from "@/components/review-mode"
import { Button } from "@/components/ui/button"
import { clearOverride, putOverride } from "@/lib/overrides/client"
import { cn } from "@/lib/utils"
import type { ExpenseType } from "@/shared/types"

/** One transaction row: display fields plus the classified type, AI signals, and any manual override. */
export interface TransactionRow {
  id: string
  date: string
  merchant: string
  amount: number
  classifiedType: ExpenseType | null
  /** AI confidence 0..1; null for credits and not-yet-classified (pending/failed) rows. */
  confidence: number | null
  /** AI's free-text rationale, shown in rapid review; null/empty when there's none. */
  reasoning: string | null
  overrideType: ExpenseType | null
  classificationStatus: "pending" | "classified" | "failed"
}

/**
 * A statement period's transactions (Phase H) with an inline expense-type control per row. The
 * effective type is `overrideType ?? classifiedType`; <OverrideControl> persists a change and we
 * update the row locally so it reflects immediately (clearing reverts to the classified type).
 *
 * Rendered as a borderless table on a horizontal-scroll wrapper so it never breaks the page layout
 * on narrow screens (the per-row control keeps the table from collapsing into stacked cards).
 */
export function TransactionsTable({
  rows: initial,
  currency,
  className,
}: {
  rows: TransactionRow[]
  currency: string
  className?: string
}) {
  const [rows, setRows] = useState(initial)
  const [reviewOpen, setReviewOpen] = useState(false)

  // Mirror the latest rows so an override handler can read the pre-change value (to revert on a
  // failed write) without re-creating the callback on every row update.
  const rowsRef = useRef(rows)
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  // Persist a review decision and optimistically update the row so the table reflects it on close;
  // revert on failure. `null` clears the override (DELETE); any type — incl. `""` — sets one (PUT).
  const handleReviewOverride = useCallback(
    (id: string, type: ExpenseType | null) => {
      const prevType =
        rowsRef.current.find((row) => row.id === id)?.overrideType ?? null
      setRows((current) =>
        current.map((row) =>
          row.id === id ? { ...row, overrideType: type } : row
        )
      )
      const persist = type === null ? clearOverride(id) : putOverride(id, type)
      persist.catch(() => {
        setRows((current) =>
          current.map((row) =>
            row.id === id ? { ...row, overrideType: prevType } : row
          )
        )
      })
    },
    []
  )

  // Expenses without a manual override yet — the rapid-review queue (and its badge count).
  const needsAttention = rows.filter(
    (row) => row.amount < 0 && row.overrideType === null
  ).length

  const fmtAmount = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)

  const fmtDate = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(date))

  function handleChanged(
    id: string,
    next: { expenseType: ExpenseType | null; hasOverride: boolean }
  ) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, overrideType: next.hasOverride ? next.expenseType : null }
          : row
      )
    )
  }

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-6 py-12 text-center",
          className
        )}
      >
        <p className="text-sm font-medium">No transactions in this period</p>
        <p className="text-sm text-muted-foreground">
          Pick another period or upload a statement.
        </p>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {needsAttention > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReviewOpen(true)}
          >
            ⚡ Rapid review ({needsAttention})
          </Button>
        </div>
      )}
      <div className="-mx-6 -my-2 overflow-x-auto whitespace-nowrap">
        <div className="inline-block min-w-full px-6 py-2 align-middle">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium whitespace-nowrap">
                  Date
                </th>
                <th className="py-2 pr-4 font-medium whitespace-nowrap">
                  Merchant
                </th>
                <th className="py-2 pr-4 text-right font-medium whitespace-nowrap">
                  Amount
                </th>
                <th className="py-2 font-medium whitespace-nowrap">Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const effective: ExpenseType =
                  row.overrideType ?? row.classifiedType ?? ""
                // An unclassified row's effective "" would read as a real "Split / none" — label it so
                // a pending/failed row is distinguishable until it's classified or manually overridden.
                const unclassified =
                  row.classificationStatus !== "classified" &&
                  row.overrideType === null
                const isCredit = row.amount > 0
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 pr-4 text-muted-foreground tabular-nums">
                      {fmtDate(row.date)}
                    </td>
                    <td className="py-3 pr-4 font-medium">{row.merchant}</td>
                    <td
                      className={cn(
                        "py-3 pr-4 text-right tabular-nums",
                        isCredit && "text-emerald-600 dark:text-emerald-500"
                      )}
                    >
                      {fmtAmount(row.amount)}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-col gap-1">
                        {unclassified && (
                          <span className="text-muted-foreground">
                            {row.classificationStatus === "failed"
                              ? "Classification failed"
                              : "Awaiting classification"}
                          </span>
                        )}
                        <OverrideControl
                          transactionId={row.id}
                          value={effective}
                          hasOverride={row.overrideType !== null}
                          onChanged={(next) => handleChanged(row.id, next)}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {reviewOpen && (
        <ReviewMode
          rows={rows}
          currency={currency}
          onOverride={handleReviewOverride}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  )
}
