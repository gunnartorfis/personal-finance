import { CycleSummary } from "@/components/cycle-summary"
import { PeriodSelector, type PeriodOption } from "@/components/period-selector"
import {
  TransactionsTable,
  type TransactionRow,
} from "@/components/transactions-table"
import {
  currentCycleKey,
  cycleKeyLabel,
  cycleKeyRange,
  isValidCycleKey,
} from "@/lib/dashboard/cycle"
import { loadNetSummary } from "@/lib/dashboard/net-summary"
import { requireHousehold } from "@/lib/household/current"
import type { ExpenseType } from "@/shared/types"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Transactions for one statement cycle (Phase H), with period navigation. The selected cycle comes
 * from the `?cycle=YYYY-MM` query param (defaulting to the current month), so any past period is
 * shareable and survives a refresh. The page loads that period's rows and net summary plus the list
 * of cycles that have data to drive the selector; the table persists per-row overrides client-side.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>
}) {
  const { repo, billingCurrency } = await requireHousehold()
  const current = currentCycleKey(new Date())
  const { cycle } = await searchParams
  const selected = cycle && isValidCycleKey(cycle) ? cycle : current
  const range = cycleKeyRange(selected)

  const [rawRows, summary, months] = await Promise.all([
    repo.transactions.listWithOverrides(range),
    loadNetSummary(repo, range),
    repo.transactions.cycleMonths(),
  ])

  // Always offer the current month and the selected period even before either has data, so the
  // picker never hides where the user is (or the obvious "this month" landing spot). Keys sort
  // lexicographically the same as chronologically; reverse for newest-first.
  const keys = Array.from(new Set([current, selected, ...months]))
    .filter(isValidCycleKey)
    .sort()
    .reverse()
  const options: PeriodOption[] = keys.map((key) => ({
    key,
    label: cycleKeyLabel(key),
  }))

  // The DB CHECK constrains these text columns to valid expense types, so the cast is safe.
  const rows: TransactionRow[] = rawRows.map((row) => ({
    ...row,
    classifiedType: row.classifiedType as ExpenseType | null,
    overrideType: row.overrideType as ExpenseType | null,
  }))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Transactions
          </h1>
          <p className="text-sm text-pretty text-muted-foreground">
            Review and reclassify spending for the selected period.
          </p>
        </div>
        <PeriodSelector options={options} selected={selected} />
      </header>

      <CycleSummary summary={summary} currency={billingCurrency} />

      {/* Key by cycle so a soft navigation remounts the table and re-seeds its local row
          state from the new period's server data (useState only runs its initialiser on mount). */}
      <TransactionsTable key={selected} rows={rows} currency={billingCurrency} />
    </div>
  )
}
