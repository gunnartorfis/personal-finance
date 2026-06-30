import type { HouseholdRepo } from "@/lib/db/household-repo";
import type { merchantRules } from "@/lib/db/schema";
import { applyMerchantRules, type MerchantRule } from "@/shared/merchant-rules";
import type { ExpenseType } from "@/shared/types";

/**
 * Rules-first classification pass (ADR-0005): apply the Household's deterministic merchant rules
 * to pending transactions before the AI model. A rule-matched row is classified directly (skipping
 * the model entirely); unmatched rows stay `pending` for the background worker. Runs through the
 * household-scoped repo and the idempotent `classify` (only touches still-pending rows).
 */
type MerchantRuleRow = typeof merchantRules.$inferSelect;

/** Convert a stored merchant_rules row into the matcher's flat-or-split rule shape. */
function toMerchantRule(r: MerchantRuleRow): MerchantRule {
  if (r.flatType !== null) {
    return { merchant: r.merchant, type: r.flatType as ExpenseType };
  }
  return {
    merchant: r.merchant,
    threshold: r.threshold as number,
    atOrAbove: r.atOrAboveType as ExpenseType,
    below: r.belowType as ExpenseType,
  };
}

export interface RulesFirstResult {
  /** Rows classified by a merchant rule (skipped the model). */
  classified: number;
  /** Rows left pending for the AI worker. */
  remaining: number;
}

export async function applyRulesFirst(repo: HouseholdRepo): Promise<RulesFirstResult> {
  const rules = (await repo.merchantRules.list()).map(toMerchantRule);
  const pending = await repo.transactions.listPending();

  let classified = 0;
  for (const txn of pending) {
    // A manual override already fixes this row's type and wins on read, so don't spend a rule match
    // recording a type the override hides — leave it for the worker to record the override's type.
    if (txn.overrideType !== null) continue;
    const match = applyMerchantRules(rules, { merchant: txn.merchant, amount: txn.amount });
    if (!match.matched) continue;
    // Count only rows this pass actually classified — classify() is a no-op (returns []) if the
    // row was already classified (e.g. a concurrent worker), so don't overcount.
    const updated = await repo.transactions.classify(txn.id, {
      expenseType: match.type,
      confidence: 1,
      reasoning: "merchant rule",
    });
    if (updated.length > 0) classified += 1;
  }
  return { classified, remaining: pending.length - classified };
}
