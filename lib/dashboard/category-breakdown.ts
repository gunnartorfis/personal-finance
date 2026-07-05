import type { HouseholdRepo } from "@/lib/db/household-repo";

/**
 * Spend broken down by semantic Category for a statement cycle (ADR-0020) — the parallel to
 * {@link import("./net-summary").NetSummary}'s expense-type split, on the orthogonal Category axis.
 *
 * Amounts are signed as stored (expenses ≤ 0) and use each row's **effective amount** (own share on
 * a Shared expense, ADR-0014). `byCategory` is dynamically keyed by `category_id` (unlike the fixed
 * expense-type buckets), and `uncategorized` collects expense rows with no Category, so the parallel
 * reconciliation invariant `sum(byCategory) + uncategorized === expense` holds. Credits count for
 * nothing here (ADR-0009), exactly as on the expense-type side.
 */
export interface CategoryBreakdown {
  /** Sum of expenses (≤ 0) — the same expense total as the net summary, partitioned below. */
  expense: number;
  /** Expense total (signed, ≤ 0) per `category_id`. Dynamically keyed — only present categories appear. */
  byCategory: Record<string, number>;
  /** Expense total (signed, ≤ 0) for rows with no Category (Uncategorized). */
  uncategorized: number;
}

/** One row's contribution: its effective amount and resolved Category id. */
export interface CategoryBreakdownRow {
  amount: number;
  /** Effective Category leaf id, or null (Uncategorized). */
  categoryId: string | null;
}

/**
 * Fold rows into a {@link CategoryBreakdown}. Pure and side-effect free (the DB read lives in
 * {@link loadCategoryBreakdown}). Only the spend axis matters here: every credit (`amount > 0`) is
 * skipped regardless of income marking (ADR-0009); each expense lands in its Category bucket, or
 * `uncategorized`.
 */
export function computeCategoryBreakdown(
  rows: ReadonlyArray<CategoryBreakdownRow>,
): CategoryBreakdown {
  const byCategory: Record<string, number> = {};
  let expense = 0;
  let uncategorized = 0;

  for (const { amount, categoryId } of rows) {
    if (amount > 0) continue; // credits contribute to nothing on the spend axis
    expense += amount;
    if (categoryId === null) {
      uncategorized += amount;
    } else {
      byCategory[categoryId] = (byCategory[categoryId] ?? 0) + amount;
    }
  }

  return { expense, byCategory, uncategorized };
}

/** Default number of named Category rows shown before the tail collapses into "Other". */
const DEFAULT_TOP_N = 8;

/**
 * One ranked slice of the Category breakdown for display (ADR-0020, S5b). Magnitudes are positive
 * (spend is stored ≤ 0); `share` is the fraction of total spend (0..1). Discriminated so the view can
 * localize the pseudo-rows: `other` carries how many named categories it collapsed, `uncategorized`
 * the no-Category remainder — both label themselves in the component (they have no `labelKey`).
 */
export type CategoryRankRow =
  | { kind: "category"; categoryId: string; magnitude: number; share: number }
  | { kind: "other"; count: number; magnitude: number; share: number }
  | { kind: "uncategorized"; magnitude: number; share: number };

/** A {@link CategoryBreakdown} ranked for the chart: ordered rows + the total spend magnitude. */
export interface RankedCategoryBreakdown {
  rows: CategoryRankRow[];
  /** Total spend magnitude (`-expense`); the denominator every row's `share` is taken against. */
  total: number;
}

/**
 * Rank a {@link CategoryBreakdown} into display rows (ADR-0020, S5b): named categories by descending
 * magnitude (ties broken by `category_id` for stable output), the tail beyond `topN` folded into one
 * `other` row, and any Uncategorized spend appended last. Pure — the React chart (S5b-2) localizes the
 * labels and picks colours. `share` is each row's fraction of total spend, so the shares sum to 1.
 */
export function rankCategoryBreakdown(
  breakdown: CategoryBreakdown,
  { topN = DEFAULT_TOP_N }: { topN?: number } = {},
): RankedCategoryBreakdown {
  // Normalize to +0 (negating a 0 expense yields -0, which leaks through toEqual/JSON).
  const total = breakdown.expense === 0 ? 0 : -breakdown.expense;
  const share = (magnitude: number) => (total > 0 ? magnitude / total : 0);

  const sorted = Object.entries(breakdown.byCategory)
    .map(([categoryId, amount]) => ({ categoryId, magnitude: -amount }))
    .filter((entry) => entry.magnitude > 0)
    // Descending magnitude; ties resolved by id so the output is deterministic across runs.
    .sort((a, b) => b.magnitude - a.magnitude || a.categoryId.localeCompare(b.categoryId));

  const rows: CategoryRankRow[] = sorted
    .slice(0, topN)
    .map(({ categoryId, magnitude }) => ({
      kind: "category" as const,
      categoryId,
      magnitude,
      share: share(magnitude),
    }));

  const tail = sorted.slice(topN);
  if (tail.length > 0) {
    const magnitude = tail.reduce((sum, entry) => sum + entry.magnitude, 0);
    rows.push({ kind: "other", count: tail.length, magnitude, share: share(magnitude) });
  }

  const uncategorized = -breakdown.uncategorized;
  if (uncategorized > 0) {
    rows.push({ kind: "uncategorized", magnitude: uncategorized, share: share(uncategorized) });
  }

  return { rows, total };
}

/**
 * Load and compute the Category breakdown for the current Household over a half-open date range
 * `[from, to)`. Reads the same filtered, own-share-aware, transfer/excluded-dropped rows as the net
 * summary. The effective Category is the manual **Override** if set, else the row's classified/rule
 * `category_id` — mirroring `overrideType ?? classifiedType` on the Expense-type axis (ADR-0020).
 */
export async function loadCategoryBreakdown(
  repo: HouseholdRepo,
  range: { from: string; to: string },
): Promise<CategoryBreakdown> {
  const rows = await repo.transactions.summaryRows(range);
  return computeCategoryBreakdown(
    rows.map((row) => ({
      amount: row.amount,
      categoryId: row.overrideCategoryId ?? row.categoryId ?? null,
    })),
  );
}
