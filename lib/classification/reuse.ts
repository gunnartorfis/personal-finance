import { normalizeMerchant } from "@/shared/merchant-rules";
import type { ExpenseType } from "@/shared/types";

/**
 * Classification reuse (ADR-0012): skip the model by reusing the Expense type the Household's own
 * prior confident model classifications gave the same merchant. This module is the pure seed
 * builder; the drain applies it and augments it within a run.
 *
 * Cross-run reuse requires confidence — only classifications at or above {@link REUSE_CONFIDENCE_FLOOR}
 * feed the seed, so a low-confidence guess never becomes a permanent cache entry. When a merchant's
 * confident history disagrees (an amount-sensitive merchant the model split by charge size),
 * **majority wins**; an exact tie is skipped so the model decides that merchant afresh.
 */
export const REUSE_CONFIDENCE_FLOOR = 0.7;

/** One (merchant, type) tally row: how many confident classifications, and their top confidence. */
export interface ReuseTally {
  merchant: string;
  expenseType: ExpenseType;
  n: number;
  maxConfidence: number | null;
}

/** A reusable decision for a merchant: the winning type and a representative confidence. */
export interface ReuseEntry {
  type: ExpenseType;
  confidence: number | null;
}

/**
 * Build the normalized-merchant → {@link ReuseEntry} seed from confident model-classification
 * tallies. Tallies are summed per normalized merchant (so "BONUS" and "BONUS 045" share), then the
 * majority type wins; a tie drops the merchant from the seed (the model classifies it). The entry's
 * confidence is the top confidence seen for the winning type.
 */
export function buildReuseSeed(tallies: ReuseTally[]): Map<string, ReuseEntry> {
  const byMerchant = new Map<string, Map<ExpenseType, { n: number; confidence: number }>>();
  for (const t of tallies) {
    const key = normalizeMerchant(t.merchant);
    const inner = byMerchant.get(key) ?? new Map<ExpenseType, { n: number; confidence: number }>();
    const prev = inner.get(t.expenseType);
    inner.set(t.expenseType, {
      n: (prev?.n ?? 0) + t.n,
      confidence: Math.max(prev?.confidence ?? 0, t.maxConfidence ?? 0),
    });
    byMerchant.set(key, inner);
  }

  const seed = new Map<string, ReuseEntry>();
  for (const [key, inner] of byMerchant) {
    let best: ExpenseType | null = null;
    let bestN = 0;
    let bestConfidence = 0;
    let tied = false;
    for (const [type, { n, confidence }] of inner) {
      if (n > bestN) {
        best = type;
        bestN = n;
        bestConfidence = confidence;
        tied = false;
      } else if (n === bestN) {
        tied = true;
      }
    }
    // A tie for the top count means the merchant's confident history is genuinely split — skip it
    // so the model (which sees the amount) decides, rather than guessing one side.
    if (best !== null && !tied) seed.set(key, { type: best, confidence: bestConfidence });
  }
  return seed;
}
