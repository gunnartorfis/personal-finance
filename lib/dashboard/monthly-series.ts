import type { HouseholdRepo } from "@/lib/db/household-repo";
import type { CycleAmounts } from "@/shared/income-timeline";

import { loadConfiguredAmountsByCycle } from "./configured-amounts";
import type { CycleKey } from "./cycle";
import { cycleKeyRange, recentCycleKeys } from "./cycle";

/**
 * One month in the dashboard's rolling spend trend (Phase K).
 *
 * `spending` (>= 0) and `income` (>= 0) each combine card activity with the configured amounts in
 * force that cycle (ADR-0015). `spending` = the magnitude of the month's card debits plus the
 * configured Off-card fixed costs (recurring in force plus one-off costs). `income` = card credits
 * manually marked as income (ADR-0009) plus the configured Monthly income (recurring in force plus
 * one-off income); unmarked credits count for nothing. Both are in the Household's billing currency
 * (ADR-0004). `difference` is `income - spending`, negative in a normal spending month.
 */
export interface MonthlySpendPoint {
  month: CycleKey;
  spending: number;
  income: number;
  difference: number;
}

/** A raw per-month aggregate as returned by the repo (before gap-filling). */
export interface MonthlySpendRow {
  month: string;
  spending: number;
  income: number;
}

/**
 * Fold raw per-month aggregates into a dense series over exactly `monthKeys` (oldest first). Pure and
 * side-effect free so it is unit-tested directly; the database read lives in
 * {@link loadMonthlySpendSeries}. Months absent from `rows` are filled with zeros, and rows for
 * months outside `monthKeys` are ignored — so the series always has one point per requested month,
 * in the requested order.
 *
 * `configuredByMonth` carries each cycle's configured amounts (recurring sources in force plus
 * one-off adjustments, ADR-0015): its `monthlyIncome` is added on top of the row's marked-credit
 * income and its `offCardFixed` on top of the row's card debits, so the trend reflects the
 * Household's off-card configuration even when a cycle has no matching card activity. Cycles absent
 * from the map contribute nothing.
 */
export function buildMonthlySpendSeries(
  rows: ReadonlyArray<MonthlySpendRow>,
  monthKeys: ReadonlyArray<CycleKey>,
  configuredByMonth: ReadonlyMap<CycleKey, CycleAmounts> = new Map(),
): MonthlySpendPoint[] {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  return monthKeys.map((month) => {
    const row = byMonth.get(month);
    const configured = configuredByMonth.get(month);
    const spending = (row?.spending ?? 0) + (configured?.offCardFixed ?? 0);
    const income = (row?.income ?? 0) + (configured?.monthlyIncome ?? 0);
    return { month, spending, income, difference: income - spending };
  });
}

/**
 * Load the Household's spend trend for the `count` most recent calendar months ending at `now`
 * (default 12), oldest first. Bounds the SQL read to that window, then gap-fills to a dense series.
 *
 * Both series fold in configured amounts (ADR-0015) resolved from the effective-dated
 * Income-settings timelines the Savings math also reads: income adds the configured Monthly income
 * on top of marked card credits, and spending adds the configured Off-card fixed costs on top of the
 * card debits — so the trend mirrors the Household's off-card configuration on both sides.
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
  const [rows, configuredByMonth] = await Promise.all([
    repo.transactions.monthlySpendSeries(range),
    loadConfiguredAmountsByCycle(repo, keys),
  ]);
  return buildMonthlySpendSeries(rows, keys, configuredByMonth);
}
