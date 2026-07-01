import type { HouseholdRepo } from "@/lib/db/household-repo";
import { normalizeMerchant } from "@/shared/merchant-rules";
import type { ExpenseType } from "@/shared/types";

import type { CategoryTrendPoint } from "./category-trend";
import { loadCategoryTrend } from "./category-trend";
import type { CycleKey } from "./cycle";
import { currentCycleKey, cycleKeyRange, cycleRange, recentCycleKeys } from "./cycle";

/**
 * A "biggest mover" (Phase K, ADR-0008): an entity (merchant or category) whose spend in the last
 * completed month rose above its baseline — the average over the earlier completed months. Only
 * risers are returned. `deltaPct` is null when the baseline is zero (a brand-new line item).
 */
export interface Mover {
  name: string;
  lastMonth: number;
  baselineAverage: number;
  delta: number;
  deltaPct: number | null;
}

/** A per-entity, per-month spend row — the input to {@link computeMovers}. */
export interface EntitySpendRow {
  name: string;
  month: string;
  spending: number;
}

/** The single largest charge in a period, for the hero info line. */
export interface LargestCharge {
  merchant: string;
  amount: number;
}

/** Only the three real spend categories are meaningful movers ("" and unclassified are excluded). */
const MOVER_CATEGORIES: readonly ExpenseType[] = ["Fixed", "Necessary", "Nice to have"];

/**
 * Compute the top `limit` risers: entities whose spend in the last completed month exceeds their
 * baseline (the mean over the earlier completed months). Pure; needs at least two completed months
 * (one baseline + the last). Decliners are dropped, ties break by name, duplicate (name, month) rows
 * accumulate. `completedKeys` must be oldest-first.
 */
export function computeMovers(
  rows: ReadonlyArray<EntitySpendRow>,
  completedKeys: ReadonlyArray<CycleKey>,
  limit: number,
): Mover[] {
  if (completedKeys.length < 2) return [];
  const lastKey = completedKeys[completedKeys.length - 1];
  const baselineKeys = completedKeys.slice(0, -1);

  const byName = new Map<string, Map<string, number>>();
  for (const { name, month, spending } of rows) {
    let months = byName.get(name);
    if (!months) {
      months = new Map();
      byName.set(name, months);
    }
    months.set(month, (months.get(month) ?? 0) + spending);
  }

  const movers: Mover[] = [];
  for (const [name, months] of byName) {
    const lastMonth = months.get(lastKey) ?? 0;
    const baselineAverage = Math.round(
      baselineKeys.reduce((sum, key) => sum + (months.get(key) ?? 0), 0) / baselineKeys.length,
    );
    const delta = lastMonth - baselineAverage;
    if (delta <= 0) continue;
    const deltaPct = baselineAverage > 0 ? Math.round((delta / baselineAverage) * 100) : null;
    movers.push({ name, lastMonth, baselineAverage, delta, deltaPct });
  }

  return movers
    .sort((a, b) => b.delta - a.delta || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, limit);
}

/** Flatten a category trend into per-category, per-month spend rows for the three spend categories. */
export function categoryEntityRows(
  trend: ReadonlyArray<CategoryTrendPoint>,
): EntitySpendRow[] {
  const rows: EntitySpendRow[] = [];
  for (const point of trend) {
    for (const name of MOVER_CATEGORIES) {
      rows.push({ name, month: point.month, spending: point.byExpenseType[name] });
    }
  }
  return rows;
}

/**
 * Load the top-3 merchant and top-3 category movers for the Household over the `count`-month window
 * ending at `now`. Completed months are trimmed to start at the first month with any spend, so a new
 * Household's leading empty months don't dilute the baseline. Pass `categoryTrend` when the caller
 * has already loaded it (e.g. the dashboard view-model) to avoid re-querying it.
 */
export async function loadBiggestMovers(
  repo: HouseholdRepo,
  now: Date,
  count = 12,
  categoryTrend?: CategoryTrendPoint[],
): Promise<{ merchants: Mover[]; categories: Mover[] }> {
  const keys = recentCycleKeys(now, count);
  if (keys.length === 0) return { merchants: [], categories: [] };
  const currentKey = currentCycleKey(now);
  const range = {
    from: cycleKeyRange(keys[0]).from,
    to: cycleKeyRange(keys[keys.length - 1]).to,
  };

  const [merchantRows, trend] = await Promise.all([
    repo.transactions.monthlyMerchantSpend(range),
    categoryTrend ? Promise.resolve(categoryTrend) : loadCategoryTrend(repo, now, count),
  ]);

  const firstActive = merchantRows.reduce<string | null>(
    (min, row) => (min === null || row.month < min ? row.month : min),
    null,
  );
  const completedKeys = keys.filter(
    (key) => key < currentKey && (firstActive === null || key >= firstActive),
  );

  const merchants = computeMovers(
    merchantRows.map((row) => ({
      name: normalizeMerchant(row.merchant),
      month: row.month,
      spending: row.spending,
    })),
    completedKeys,
    3,
  );
  const categories = computeMovers(categoryEntityRows(trend), completedKeys, 3);
  return { merchants, categories };
}

/** Load the single largest charge in the current statement cycle (or null when there are none). */
export async function loadLargestCharge(
  repo: HouseholdRepo,
  now: Date,
): Promise<LargestCharge | null> {
  const row = await repo.transactions.largestCharge(cycleRange(now));
  return row ?? null;
}
