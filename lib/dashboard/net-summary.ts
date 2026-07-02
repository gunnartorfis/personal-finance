import type { HouseholdRepo } from "@/lib/db/household-repo";
import { isExpenseType } from "@/shared/types";
import type { ExpenseType } from "@/shared/types";

/**
 * The net profit/loss summary for a statement cycle (Phase F).
 *
 * Amounts are in the Household's billing currency (ADR-0004), signed as stored: income is positive,
 * expenses negative. `byExpenseType` and `unclassified` partition the expense side, so
 * `sum(byExpenseType) + unclassified === expense` and `income + expense === net`.
 *
 * Credits count as income only when manually marked (ADR-0009); an unmarked credit — typically an
 * inter-account transfer, card-bill payment, or refund — contributes to nothing here.
 */
export interface NetSummary {
  /** Sum of credits manually marked as income (amount > 0 and incomeMarked). */
  income: number;
  /** Sum of expenses (amount <= 0); zero or negative. */
  expense: number;
  /** `income + expense`: positive is a profit, negative a loss. */
  net: number;
  /** Expense totals (signed, <= 0) per effective expense type. */
  byExpenseType: Record<ExpenseType, number>;
  /** Expense total (signed, <= 0) for rows with no effective type yet (pending / failed). */
  unclassified: number;
}

/** One row's contribution to the summary: its charged amount and resolved expense type. */
export interface NetSummaryRow {
  amount: number;
  /** Whether a Member manually marked this credit as real income (ADR-0009). */
  incomeMarked: boolean;
  /** Override type if present, else the classified type, else null when not yet classified. */
  effectiveType: ExpenseType | null;
}

/** A zeroed bucket record for every {@link ExpenseType} — the starting point for expense folds. */
export function emptyByExpenseType(): Record<ExpenseType, number> {
  return { Fixed: 0, Necessary: 0, "Nice to have": 0, "": 0 };
}

/**
 * Narrow a raw DB string (Drizzle types both expense columns as `string | null`) to a known
 * {@link ExpenseType}, or `null`. DB CHECK constraints are the real guard, but this keeps the
 * narrowing honest at runtime: an unexpected value resolves to `null` (counted as unclassified)
 * rather than silently creating a phantom bucket and breaking the reconciliation invariant.
 */
export function toEffectiveType(value: string | null): ExpenseType | null {
  return isExpenseType(value) ? value : null;
}

/**
 * Fold rows into a {@link NetSummary}. Pure and side-effect free so it can be unit-tested directly;
 * the database read lives in {@link loadNetSummary}. Credits marked as income add to income;
 * unmarked credits are excluded entirely (ADR-0009); everything else is an expense, bucketed by
 * its effective type (or `unclassified` when the type is unknown).
 */
export function computeNetSummary(rows: ReadonlyArray<NetSummaryRow>): NetSummary {
  const byExpenseType = emptyByExpenseType();
  let income = 0;
  let expense = 0;
  let unclassified = 0;

  for (const { amount, incomeMarked, effectiveType } of rows) {
    if (amount > 0) {
      if (incomeMarked) income += amount;
      continue;
    }
    expense += amount;
    // Defence in depth: only a known bucket is summed; anything else counts as unclassified, so the
    // `sum(byExpenseType) + unclassified === expense` invariant holds even on unexpected input.
    if (effectiveType !== null && effectiveType in byExpenseType) {
      byExpenseType[effectiveType] += amount;
    } else {
      unclassified += amount;
    }
  }

  return { income, expense, net: income + expense, byExpenseType, unclassified };
}

/**
 * Load and compute the net summary for the current Household over a half-open date range
 * `[from, to)` (e.g. a calendar month). The Override type takes precedence over the classified type.
 */
export async function loadNetSummary(
  repo: HouseholdRepo,
  range: { from: string; to: string },
): Promise<NetSummary> {
  const rows = await repo.transactions.summaryRows(range);
  return computeNetSummary(
    rows.map((row) => ({
      amount: row.amount,
      incomeMarked: row.incomeMarked,
      effectiveType: toEffectiveType(row.overrideType ?? row.classifiedType),
    })),
  );
}
