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

/**
 * Load and compute the Category breakdown for the current Household over a half-open date range
 * `[from, to)`. Reads the same filtered, own-share-aware, transfer/excluded-dropped rows as the net
 * summary. The effective Category is the row's `category_id` (a manual Category override, S3b, will
 * take precedence here once it exists — mirroring `overrideType ?? classifiedType`).
 */
// react-doctor-disable-next-line deslop/unused-export -- public loader for #105 S4, wired in follow-up (mirrors sibling dashboard loaders)
export async function loadCategoryBreakdown(
  repo: HouseholdRepo,
  range: { from: string; to: string },
): Promise<CategoryBreakdown> {
  const rows = await repo.transactions.summaryRows(range);
  return computeCategoryBreakdown(
    rows.map((row) => ({
      amount: row.amount,
      categoryId: row.categoryId ?? null,
    })),
  );
}
