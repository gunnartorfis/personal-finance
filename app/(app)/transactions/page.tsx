import { TransactionsTable, type TransactionRow } from "@/components/transactions-table"
import { cycleLabel, cycleRange } from "@/lib/dashboard/cycle"
import { requireHousehold } from "@/lib/household/current"
import type { ExpenseType } from "@/shared/types"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Transactions for the current statement cycle (Phase H) with an inline expense-type override per
 * row. Read server-side via the household repo; the table persists changes through <OverrideControl>.
 */
export default async function TransactionsPage() {
  const { repo, billingCurrency } = await requireHousehold()
  const now = new Date()
  const raw = await repo.transactions.listWithOverrides(cycleRange(now))
  // The DB CHECK constrains these text columns to valid expense types, so the cast is safe.
  const rows: TransactionRow[] = raw.map((row) => ({
    ...row,
    classifiedType: row.classifiedType as ExpenseType | null,
    overrideType: row.overrideType as ExpenseType | null,
  }))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Transactions</h1>
      <p className="text-sm text-muted-foreground">{cycleLabel(now)}</p>
      <TransactionsTable rows={rows} currency={billingCurrency} />
    </div>
  )
}
