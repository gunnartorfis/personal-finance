import type { HouseholdRepo } from "@/lib/db/household-repo";
import { NOT_BUCKETED, canClassify, isExpense } from "@/shared/free-cap";
import {
  applyMerchantRules,
  normalizeMerchant,
  toMerchantRule,
} from "@/shared/merchant-rules";
import type { ExpenseType, Plan } from "@/shared/types";

import { CREDIT_REASON, MERCHANT_RULE_REASON, REUSED_REASON } from "./reasons";
import { REUSE_CONFIDENCE_FLOOR, buildReuseSeed } from "./reuse";

/**
 * Background classification worker — orchestration (ADR-0005).
 *
 * Drains a Household's pending transactions. Credits (non-expense rows) are not bucketed and need
 * no model call. Expense rows go through the precedence chain (CONTEXT.md): a deterministic
 * Merchant rule is applied first and skips the model entirely; then Classification reuse (ADR-0012)
 * reuses the type the Household's own prior confident classifications gave the same merchant;
 * otherwise the row is classified by an injected `Classifier` (the real Sonnet 5 call via the
 * Vercel AI Gateway is wired separately, so this core is testable without a key). The drain is
 * crash-safe / resumable: it only touches `pending` rows (classify/markFailed are no-ops
 * otherwise), so re-running continues where a previous run stopped. A classifier error marks just
 * that row `failed` and the drain continues.
 *
 * The Free cap (ADR-0002) is enforced on the model AND reuse paths: a Free Household stops being
 * classified once it has 50 classified Transactions lifetime — a reused type is still a
 * Classification, so it counts toward and is gated by the cap. Credits and Merchant-rule matches
 * are cheap/deterministic and are not gated (though they still count toward it, like credits).
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
  /**
   * How many of `classified` were served by Classification reuse (no model call) — a subset of
   * `classified`, not an additional bucket. Observability only; the progress/stop logic keys off
   * `classified`.
   */
  reused: number;
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
  const rules = (await repo.merchantRules.list()).map(toMerchantRule);
  // Classification reuse seed (ADR-0012): normalized merchant → confident majority type from the
  // Household's own model history. Mutated below to also cover merchants first seen in THIS run.
  const reuse = buildReuseSeed(
    (await repo.transactions.reuseTallies(REUSE_CONFIDENCE_FLOOR))
      // A classified row always has a non-null type (DB CHECK). Drop any null defensively rather
      // than coercing it to "" (NOT_BUCKETED), which would mis-bucket a genuine expense.
      .filter((t): t is typeof t & { expenseType: string } => t.expenseType !== null)
      .map((t) => ({
        merchant: t.merchant,
        expenseType: t.expenseType as ExpenseType,
        n: t.n,
        maxConfidence: t.maxConfidence,
      })),
  );
  let classifiedCount = await repo.transactions.countClassified();

  let classified = 0;
  let failed = 0;
  let capped = 0;
  let reused = 0;
  for (const txn of batch) {
    if (!isExpense(txn.amount)) {
      // Credits and transfers are not bucketed — no model call, not gated by the cap.
      const [row] = await repo.transactions.classify(txn.id, {
        expenseType: NOT_BUCKETED,
        reasoning: CREDIT_REASON,
      });
      if (row) {
        classified += 1;
        classifiedCount += 1;
      }
      continue;
    }
    const ruleMatch = applyMerchantRules(rules, { merchant: txn.merchant, amount: txn.amount });
    if (ruleMatch.matched) {
      // A deterministic Merchant rule wins over the model (precedence: Override > Merchant rule >
      // Classification). Like credits it skips the model and is not gated by the Free cap.
      const [row] = await repo.transactions.classify(txn.id, {
        expenseType: ruleMatch.type,
        confidence: 1,
        reasoning: MERCHANT_RULE_REASON,
      });
      if (row) {
        classified += 1;
        classifiedCount += 1;
      }
      continue;
    }
    if (!canClassify(opts.plan, classifiedCount)) {
      // Free cap reached: leave the expense pending; it classifies on upgrade. Gates reuse too — a
      // reused type is still a Classification and counts against the cap.
      capped += 1;
      continue;
    }
    const merchantKey = normalizeMerchant(txn.merchant);
    const hit = reuse.get(merchantKey);
    if (hit) {
      // Reuse the Household's own prior confident decision for this merchant — no model call.
      const [row] = await repo.transactions.classify(txn.id, {
        expenseType: hit.type,
        confidence: hit.confidence ?? undefined,
        reasoning: REUSED_REASON,
      });
      if (row) {
        classified += 1;
        classifiedCount += 1;
        reused += 1;
      }
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
      // Within-run reuse (ADR-0012): make this merchant's fresh type available to its later rows in
      // the same drain, unconditionally (regardless of confidence) — a single upload stays
      // internally consistent and costs one model call per distinct merchant. Low-confidence types
      // are still not seeded across runs (reuseTallies applies the floor next time).
      reuse.set(merchantKey, { type: result.expenseType, confidence: result.confidence ?? null });
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
  return { classified, failed, capped, reused };
}
