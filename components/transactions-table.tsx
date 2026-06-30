"use client"

import { useState } from "react"

import { OverrideControl } from "@/components/override-control"
import { cn } from "@/lib/utils"
import type { ExpenseType } from "@/shared/types"

/** One transaction row: display fields plus the classified type and any manual override. */
export interface TransactionRow {
  id: string
  date: string
  merchant: string
  amount: number
  classifiedType: ExpenseType | null
  overrideType: ExpenseType | null
  classificationStatus: "pending" | "classified" | "failed"
}

/**
 * The current cycle's transactions (Phase H) with an inline expense-type control per row. The
 * effective type is `overrideType ?? classifiedType`; <OverrideControl> persists a change and we
 * update the row locally so it reflects immediately (clearing reverts to the classified type).
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

  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(
      amount,
    )

  function handleChanged(id: string, next: { expenseType: ExpenseType | null; hasOverride: boolean }) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, overrideType: next.hasOverride ? next.expenseType : null } : row,
      ),
    )
  }

  if (rows.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>No transactions this cycle.</p>
  }

  return (
    <table className={cn("w-full border-collapse text-sm", className)}>
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-2 font-medium">Date</th>
          <th className="py-2 font-medium">Merchant</th>
          <th className="py-2 text-right font-medium">Amount</th>
          <th className="py-2 font-medium">Type</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const effective: ExpenseType = row.overrideType ?? row.classifiedType ?? ""
          // An unclassified row's effective "" would read as a real "Split / none" — label it so a
          // pending/failed row is distinguishable until it's classified or manually overridden.
          const unclassified = row.classificationStatus !== "classified" && row.overrideType === null
          return (
            <tr key={row.id} className="border-t border-border">
              <td className="py-2 tabular-nums">{row.date}</td>
              <td className="py-2">{row.merchant}</td>
              <td className="py-2 text-right tabular-nums">{fmt(row.amount)}</td>
              <td className="py-2">
                <div className="flex flex-col gap-1">
                  {unclassified && (
                    <span className="text-xs text-muted-foreground">
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
  )
}
