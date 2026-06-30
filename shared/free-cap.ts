import type { ExpenseType, Plan } from "./types";

/**
 * Expense-type model + Free-cap counting (ADR-0002, `CONTEXT.md`).
 *
 * Credits and split payments are not bucketed — they carry the empty Expense type `""` and are
 * excluded from net math. A Free Household may classify the first 50 distinct Transactions in its
 * lifetime; reaching that cap pauses AI classification only (Uploads, the dashboard, Overrides and
 * net tracking stay usable, and pending rows classify on upgrade). A Premium Household is uncapped
 * here (fair-use is enforced elsewhere).
 */

/** The lifetime classification cap for a Free Household. */
export const FREE_CAP = 50;

/** The Expense type for a row that is not bucketed: credits and split payments. */
export const NOT_BUCKETED: ExpenseType = "";

/** Whether a charged amount is an expense (negative). Credits (zero or positive) are not bucketed. */
export function isExpense(amount: number): boolean {
  return amount < 0;
}

/**
 * How many more distinct Transactions the Household may classify before classification pauses.
 * A Free Household is bounded by {@link FREE_CAP}; a Premium Household is uncapped (`Infinity`).
 */
export function freeClassificationsRemaining(plan: Plan, classifiedCount: number): number {
  if (plan === "Premium") return Infinity;
  // Fail safe: a missing or unparsable stored count must never let a Free household classify
  // past the cap, so an invalid count is treated as "cap reached" (no remaining).
  if (!Number.isFinite(classifiedCount) || classifiedCount < 0) return 0;
  return Math.max(0, FREE_CAP - classifiedCount);
}

/** Whether AI classification is paused for the Household (a Free Household at its cap). */
export function isClassificationPaused(plan: Plan, classifiedCount: number): boolean {
  return freeClassificationsRemaining(plan, classifiedCount) === 0;
}

/** Whether the Household may classify at least one more Transaction now. */
export function canClassify(plan: Plan, classifiedCount: number): boolean {
  return !isClassificationPaused(plan, classifiedCount);
}
