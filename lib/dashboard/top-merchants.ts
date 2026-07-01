import type { HouseholdRepo } from "@/lib/db/household-repo";
import { normalizeMerchant } from "@/shared/merchant-rules";

/**
 * One merchant's share of a period's spend (Phase K, ADR-0008). `merchant` is the normalized key
 * (uppercased, store-number stripped — see {@link normalizeMerchant}), `spending` its total debit
 * magnitude, and `share` its fraction (0..1) of the period's total merchant spend.
 */
export interface MerchantSpend {
  merchant: string;
  spending: number;
  share: number;
}

/** A raw per-merchant debit total as returned by the repo (before normalization/merging). */
export interface MerchantSpendRow {
  merchant: string;
  spending: number;
}

/**
 * Fold raw per-merchant debit totals into the top `limit` merchants by spend. Pure and unit-tested
 * directly; the read lives in {@link loadTopMerchants}. Raw merchants are normalized and re-aggregated
 * (so store-number variants like "BONUS 0123"/"BONUS 4567" merge), `share` is each merchant's
 * fraction of the whole period's spend (not just the top slice), and ties break by name for a stable
 * order. The limit is applied after merging.
 */
export function buildTopMerchants(
  rows: ReadonlyArray<MerchantSpendRow>,
  limit: number,
): MerchantSpend[] {
  const byKey = new Map<string, number>();
  let total = 0;
  for (const { merchant, spending } of rows) {
    const key = normalizeMerchant(merchant);
    byKey.set(key, (byKey.get(key) ?? 0) + spending);
    total += spending;
  }
  return [...byKey.entries()]
    .map(([merchant, spending]) => ({
      merchant,
      spending,
      share: total > 0 ? spending / total : 0,
    }))
    .sort((a, b) => b.spending - a.spending || a.merchant.localeCompare(b.merchant))
    .slice(0, limit);
}

/**
 * Load the top `limit` merchants (default 6) by spend for the Household over a half-open range
 * `[from, to)` — typically the trailing 3 months, computed by the caller.
 */
export async function loadTopMerchants(
  repo: HouseholdRepo,
  range: { from: string; to: string },
  limit = 6,
): Promise<MerchantSpend[]> {
  const rows = await repo.transactions.topMerchants(range);
  return buildTopMerchants(rows, limit);
}
