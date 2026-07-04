import type { HouseholdRepo } from "@/lib/db/household-repo";

import { loadConfiguredIncomeByCycle } from "./configured-income";
import type { CycleKey } from "./cycle";
import { cycleKeyRange, recentCycleKeys } from "./cycle";

/**
 * One month in the dashboard's rolling spend trend (Phase K).
 *
 * `spending` is the magnitude of the month's debits (>= 0) and `income` the month's total income
 * (>= 0): the configured recurring income in force that cycle plus its one-off income adjustments
 * (ADR-0015), plus any card credits manually marked as income (ADR-0009) — unmarked credits count
 * for nothing. Both are in the Household's billing currency (ADR-0004). `difference` is
 * `income - spending`, negative in a normal spending month.
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
 * `configuredIncomeByMonth` carries each cycle's configured income (recurring sources in force plus
 * one-off income adjustments, ADR-0015); it is added on top of the row's marked-credit income so the
 * trend reflects the Household's configured revenues even when no card credit is marked. Cycles
 * absent from the map contribute no configured income.
 */
export function buildMonthlySpendSeries(
  rows: ReadonlyArray<MonthlySpendRow>,
  monthKeys: ReadonlyArray<CycleKey>,
  configuredIncomeByMonth: ReadonlyMap<CycleKey, number> = new Map(),
): MonthlySpendPoint[] {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  return monthKeys.map((month) => {
    const row = byMonth.get(month);
    const spending = row?.spending ?? 0;
    const income = (row?.income ?? 0) + (configuredIncomeByMonth.get(month) ?? 0);
    return { month, spending, income, difference: income - spending };
  });
}

/**
 * Load the Household's spend trend for the `count` most recent calendar months ending at `now`
 * (default 12), oldest first. Bounds the SQL read to that window, then gap-fills to a dense series.
 *
 * Income folds two sources: the per-month card credits marked as income (from `monthlySpendSeries`)
 * plus the configured recurring income in force each cycle and its one-off income adjustments
 * (ADR-0015), resolved from the effective-dated Income-settings timelines the Savings math also
 * reads. Off-card costs and one-off costs are irrelevant here, so the resolver is fed empty cost
 * timelines and only `monthlyIncome` is used.
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
  const [rows, configuredIncomeByMonth] = await Promise.all([
    repo.transactions.monthlySpendSeries(range),
    loadConfiguredIncomeByCycle(repo, keys),
  ]);
  return buildMonthlySpendSeries(rows, keys, configuredIncomeByMonth);
}
