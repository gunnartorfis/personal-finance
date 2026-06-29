import type { ExpenseType } from "./types.ts";

/**
 * Deterministic merchant-rule matching (ADR-0005, `CONTEXT.md`).
 *
 * A Merchant rule is a household-level mapping from a (normalized) merchant to an Expense type,
 * applied BEFORE AI classification so rule-matched rows skip the model entirely. This module is
 * the pure matcher only; it is intentionally separate from the LLM classifier system prompt in
 * `rules.ts`.
 *
 * A rule is either flat (`merchant → type`) or split by an amount threshold
 * (`merchant, ≥ X → atOrAbove, else → below`, e.g. a gym membership vs an incidental drop-in).
 */

/** A household merchant rule: flat, or split by charge magnitude. */
export type MerchantRule =
  | { merchant: string; type: ExpenseType }
  | { merchant: string; threshold: number; atOrAbove: ExpenseType; below: ExpenseType };

/** A trailing store-number / store-code token, e.g. "045" or "#45". */
const TRAILING_STORE_CODE = /\s+#?\d+$/;

/**
 * Normalize a merchant for rule matching: uppercase, trim, collapse internal whitespace, and
 * strip a trailing store number. Icelandic letters are preserved. Location suffixes are not
 * stripped here — matching tolerates them via a word-boundary prefix (see {@link applyMerchantRules}).
 */
export function normalizeMerchant(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase().replace(TRAILING_STORE_CODE, "");
}

/** Whether a transaction's normalized merchant matches a rule's normalized merchant. */
function matches(txnMerchant: string, ruleMerchant: string): boolean {
  // Exact, or the rule merchant followed by a word boundary so "BONUS" matches
  // "BONUS KRINGLAN" but not "BONUSVERSLUN".
  return txnMerchant === ruleMerchant || txnMerchant.startsWith(`${ruleMerchant} `);
}

/**
 * Apply household merchant rules to a transaction, in order. Returns the matched Expense type,
 * or `null` if no rule matches (the row then goes to AI classification). For a split rule, the
 * charge **magnitude** (`|amount|`) is compared to the threshold, since amounts are negative.
 */
export function applyMerchantRules(
  rules: MerchantRule[],
  txn: { merchant: string; amount: number },
): ExpenseType | null {
  const merchant = normalizeMerchant(txn.merchant);
  for (const rule of rules) {
    if (!matches(merchant, normalizeMerchant(rule.merchant))) continue;
    if ("type" in rule) return rule.type;
    return Math.abs(txn.amount) >= rule.threshold ? rule.atOrAbove : rule.below;
  }
  return null;
}
