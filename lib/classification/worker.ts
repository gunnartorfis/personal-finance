import type { HouseholdRepo } from "@/lib/db/household-repo";
import { NOT_BUCKETED, canClassify, isExpense } from "@/shared/free-cap";
import type { ExpenseType, Plan } from "@/shared/types";

/**
 * Background classification worker — orchestration (ADR-0005).
 *
 * Drains a Household's pending transactions. Credits (non-expense rows) are not bucketed and need
 * no model call; expense rows are classified by an injected `Classifier` (the real Sonnet 4.6 call
 * via the Vercel AI Gateway is wired separately, so this core is testable without a key). The drain
 * is crash-safe / resumable: it only touches `pending` rows (classify/markFailed are no-ops
 * otherwise), so re-running continues where a previous run stopped. A classifier error marks just
 * that row `failed` and the drain continues.
 *
 * The Free cap (ADR-0002) is enforced on the model path: a Free Household stops being AI-classified
 * once it has 50 classified Transactions lifetime — over-cap expense rows are left `pending` and
 * classify on upgrade. Credits are cheap/deterministic and are not gated by the cap.
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
  /** Expense rows left pending because the Free cap was reached. */
  capped: number;
}

/**
 * Drain pending transactions. `limit` bounds how many are processed in one run (the durable
 * trigger calls this repeatedly until the queue is empty); `plan` gates AI classification by the
 * Free cap.
 */
export async function drainPending(
  repo: HouseholdRepo,
  classify: Classifier,
  opts: { plan: Plan; limit?: number },
): Promise<DrainResult> {
  const batch = await repo.transactions.listPending(opts.limit);
  let classifiedCount = await repo.transactions.countClassified();

  let classified = 0;
  let failed = 0;
  let capped = 0;
  for (const txn of batch) {
    if (txn.overrideType !== null) {
      // The user already typed this row by hand — record their type directly (no model call) so it
      // leaves the queue instead of burning a Sonnet call on a result the override would hide
      // anyway. Deterministic like credits, so it bypasses the Free-cap gate; it still counts as a
      // classified row (mirrors credits / `countClassified`).
      const [row] = await repo.transactions.classify(txn.id, {
        expenseType: txn.overrideType as ExpenseType,
        reasoning: "manual override",
      });
      if (row) {
        classified += 1;
        classifiedCount += 1;
      }
      continue;
    }
    if (!isExpense(txn.amount)) {
      // Credits and transfers are not bucketed — no model call, not gated by the cap.
      const [row] = await repo.transactions.classify(txn.id, {
        expenseType: NOT_BUCKETED,
        reasoning: "credit (not bucketed)",
      });
      if (row) {
        classified += 1;
        classifiedCount += 1;
      }
      continue;
    }
    if (!canClassify(opts.plan, classifiedCount)) {
      // Free cap reached: leave the expense pending; it classifies on upgrade.
      capped += 1;
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
      if (row) {
        classified += 1;
        classifiedCount += 1;
      }
    } catch (error) {
      // Surface the real cause on Vercel logs — the row is marked `failed` and the drain continues,
      // so without this the AI Gateway / schema-validation / rate-limit error vanishes silently.
      console.error(
        `[classify] failed txn=${txn.id} merchant=${JSON.stringify(txn.merchant)} amount=${txn.amount}`,
        error,
      );
      await repo.transactions.markFailed(txn.id);
      failed += 1;
    }
  }
  return { classified, failed, capped };
}
