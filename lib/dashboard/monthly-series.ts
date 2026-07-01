import type { HouseholdRepo } from "@/lib/db/household-repo";

import type { CycleKey } from "./cycle";
import { cycleKeyRange, recentCycleKeys } from "./cycle";

/**
 * One month in the dashboard's rolling spend trend (Phase K).
 *
 * `spending` is the magnitude of the month's debits (>= 0) and `moneyIn` the sum of its credits
 * (>= 0), both in the Household's billing currency (ADR-0004). `difference` is `moneyIn - spending`
 * — the honest "Money in − Spending" line (ADR-0008), negative in a normal spending month.
 */
export interface MonthlySpendPoint {
  month: CycleKey;
  spending: number;
  moneyIn: number;
  difference: number;
}

/** A raw per-month aggregate as returned by the repo (before gap-filling). */
export interface MonthlySpendRow {
  month: string;
  spending: number;
  moneyIn: number;
}

/**
 * Fold raw per-month aggregates into a dense series over exactly `monthKeys` (oldest first). Pure and
 * side-effect free so it is unit-tested directly; the database read lives in
 * {@link loadMonthlySpendSeries}. Months absent from `rows` are filled with zeros, and rows for
 * months outside `monthKeys` are ignored — so the series always has one point per requested month,
 * in the requested order.
 */
export function buildMonthlySpendSeries(
  rows: ReadonlyArray<MonthlySpendRow>,
  monthKeys: ReadonlyArray<CycleKey>,
): MonthlySpendPoint[] {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  return monthKeys.map((month) => {
    const row = byMonth.get(month);
    const spending = row?.spending ?? 0;
    const moneyIn = row?.moneyIn ?? 0;
    return { month, spending, moneyIn, difference: moneyIn - spending };
  });
}

/**
 * Load the Household's spend trend for the `count` most recent calendar months ending at `now`
 * (default 12), oldest first. Bounds the SQL read to that window, then gap-fills to a dense series.
 */
export async function loadMonthlySpendSeries(
  repo: HouseholdRepo,
  now: Date,
  count = 12,
): Promise<MonthlySpendPoint[]> {
  const keys = recentCycleKeys(now, count);
  if (keys.length === 0) return [];
  const range = {
    from: cycleKeyRange(keys[0]).from,
    to: cycleKeyRange(keys[keys.length - 1]).to,
  };
  const rows = await repo.transactions.monthlySpendSeries(range);
  return buildMonthlySpendSeries(rows, keys);
}
