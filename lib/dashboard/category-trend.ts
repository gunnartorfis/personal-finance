import type { HouseholdRepo } from "@/lib/db/household-repo";
import type { ExpenseType } from "@/shared/types";

import type { CycleKey } from "./cycle";
import { cycleKeyRange, recentCycleKeys } from "./cycle";
import { emptyByExpenseType, toEffectiveType, type NetSummary } from "./net-summary";

/**
 * One month in the stacked category-mix trend (Phase K, ADR-0008). `byExpenseType` holds the debit
 * **magnitude** (>= 0, unlike {@link NetSummary}'s signed values — a stacked chart wants heights)
 * per effective Expense type, and `unclassified` the magnitude of debits with no effective type yet
 * (pending/failed). Credits are not included.
 */
export interface CategoryTrendPoint {
  month: CycleKey;
  byExpenseType: Record<ExpenseType, number>;
  unclassified: number;
}

/** A raw per-month, per-effective-type debit total as returned by the repo. */
export interface CategoryTrendRow {
  month: string;
  effectiveType: string | null;
  spending: number;
}

/**
 * Fold raw per-month, per-type debit totals into a dense trend over exactly `monthKeys` (in order).
 * Pure and unit-tested directly; the read lives in {@link loadCategoryTrend}. Months absent from
 * `rows` are zero-filled, rows outside `monthKeys` are ignored, and an unknown/null effective type
 * folds into `unclassified` (mirroring {@link toEffectiveType}) so a phantom bucket can't appear.
 */
export function buildCategoryTrend(
  rows: ReadonlyArray<CategoryTrendRow>,
  monthKeys: ReadonlyArray<CycleKey>,
): CategoryTrendPoint[] {
  const points = new Map<string, CategoryTrendPoint>(
    monthKeys.map((month) => [
      month,
      { month, byExpenseType: emptyByExpenseType(), unclassified: 0 },
    ]),
  );
  for (const { month, effectiveType, spending } of rows) {
    const point = points.get(month);
    if (!point) continue; // outside the requested window
    const type = toEffectiveType(effectiveType);
    if (type !== null) {
      point.byExpenseType[type] += spending;
    } else {
      point.unclassified += spending;
    }
  }
  return monthKeys.map((month) => points.get(month)!);
}

/**
 * Adapt a {@link CategoryTrendPoint} (positive debit magnitudes) into the {@link NetSummary} shape
 * the spending-by-type breakdown consumes (signed, expenses ≤ 0). Only the expense side carries
 * meaning here; income/net mirror the negated expense total. A missing point (a cycle outside the
 * trend window, or one with no card debits) yields an all-zero summary. Shared by the dashboard hero
 * and the category-mix module so both read the card debits' type split identically.
 */
export function categoryPointToNetSummary(point: CategoryTrendPoint | undefined): NetSummary {
  const byType = point?.byExpenseType ?? emptyByExpenseType();
  const unclassified = point?.unclassified ?? 0;
  const expense = -(
    byType.Fixed +
    byType.Necessary +
    byType["Nice to have"] +
    byType[""] +
    unclassified
  );
  return {
    income: 0,
    expense,
    net: expense,
    byExpenseType: {
      Fixed: -byType.Fixed,
      Necessary: -byType.Necessary,
      "Nice to have": -byType["Nice to have"],
      "": -byType[""],
    },
    unclassified: -unclassified,
  };
}

/**
 * Load the Household's category-mix trend for the `count` most recent calendar months ending at
 * `now` (default 12), oldest first. Bounds the SQL read to that window, then gap-fills to a dense
 * series.
 */
export async function loadCategoryTrend(
  repo: HouseholdRepo,
  now: Date,
  count = 12,
): Promise<CategoryTrendPoint[]> {
  const keys = recentCycleKeys(now, count);
  if (keys.length === 0) return [];
  const range = {
    from: cycleKeyRange(keys[0]).from,
    to: cycleKeyRange(keys[keys.length - 1]).to,
  };
  const rows = await repo.transactions.monthlyCategorySpend(range);
  return buildCategoryTrend(rows, keys);
}
