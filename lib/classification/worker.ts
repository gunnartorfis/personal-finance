import type { HouseholdRepo } from "@/lib/db/household-repo";
import { NOT_BUCKETED, isExpense } from "@/shared/free-cap";
import type { ExpenseType } from "@/shared/types";

/**
 * Background classification worker — orchestration (ADR-0005).
 *
 * Drains a Household's pending transactions. Credits (non-expense rows) are not bucketed and need
 * no model call; expense rows are classified by an injected `Classifier` (the real Sonnet 4.6 call
 * via the Vercel AI Gateway is wired separately, so this core is testable without a key). The drain
 * is crash-safe / resumable: it only touches `pending` rows (classify/markFailed are no-ops
 * otherwise), so re-running continues where a previous run stopped. A classifier error marks just
 * that row `failed` and the drain continues.
 */

/** The salient fields a classifier sees for one transaction. */
export interface ClassifierInput {
  merchant: string;
  amount: number;
  rawCategory: string;
  date: string;
}

/** Classify one expense transaction into an Expense type (with optional confidence + reasoning). */
export type Classifier = (
  txn: ClassifierInput,
) => Promise<{ expenseType: ExpenseType; confidence?: number; reasoning?: string }>;

export interface DrainResult {
  classified: number;
  failed: number;
}

/**
 * Drain pending transactions. `limit` bounds how many are processed in one run (the durable
 * trigger calls this repeatedly until the queue is empty).
 */
export async function drainPending(
  repo: HouseholdRepo,
  classify: Classifier,
  opts: { limit?: number } = {},
): Promise<DrainResult> {
  const pending = await repo.transactions.listPending();
  const batch = opts.limit === undefined ? pending : pending.slice(0, opts.limit);

  let classified = 0;
  let failed = 0;
  for (const txn of batch) {
    if (!isExpense(txn.amount)) {
      // Credits and transfers are not bucketed — no model call.
      const [row] = await repo.transactions.classify(txn.id, {
        expenseType: NOT_BUCKETED,
        reasoning: "credit (not bucketed)",
      });
      if (row) classified += 1;
      continue;
    }
    try {
      const result = await classify({
        merchant: txn.merchant,
        amount: txn.amount,
        rawCategory: txn.rawCategory,
        date: txn.date,
      });
      const [row] = await repo.transactions.classify(txn.id, result);
      if (row) classified += 1;
    } catch {
      await repo.transactions.markFailed(txn.id);
      failed += 1;
    }
  }
  return { classified, failed };
}
