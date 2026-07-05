import type { HouseholdRepo } from "@/lib/db/household-repo";
import { normalizeMerchant } from "@/shared/merchant-rules";

import type { Classifier } from "./worker";

/** Outcome of a backfill pass. `failed` counts distinct merchants whose classify call errored. */
export interface BackfillResult {
  scanned: number;
  backfilled: number;
  failed: number;
}

/**
 * One-time Category backfill (ADR-0020, S7): assign a Category to classified expense rows that have
 * none — rows classified before the Category axis existed (or where the model abstained). It is
 * **Free-cap-harmless**: these rows already counted as Classifications, so filling a Category adds
 * no quota and the cap is not consulted.
 *
 * Seeds the Household's taxonomy first if it has none (pre-S1b households), then for each candidate
 * runs the classifier, resolves its Category slug to one of the Household's **visible** leaf ids
 * (`leafSlugToId` already excludes hidden), and fills `category_id`. A merchant that resolves to no
 * visible leaf (abstain `""`, or a hidden/unknown slug) is left Uncategorized. One model call per
 * distinct merchant via within-run reuse.
 */
export async function backfillCategories(
  repo: HouseholdRepo,
  classify: Classifier,
  opts: { limit?: number } = {},
): Promise<BackfillResult> {
  await repo.categories.ensureSeeded();
  const leafSlugToId = await repo.categories.leafSlugToId();
  const candidates = await repo.transactions.listNeedingCategory(opts.limit);

  // Within-run reuse: normalized merchant → resolved { categoryId, categoryConfidence } (or null id).
  const resolved = new Map<string, { categoryId: string | null; categoryConfidence?: number }>();
  let backfilled = 0;
  let failed = 0;

  for (const txn of candidates) {
    const key = normalizeMerchant(txn.merchant);
    let hit = resolved.get(key);
    if (!hit) {
      try {
        const result = await classify({
          merchant: txn.merchant,
          amount: txn.amount,
          rawCategory: txn.rawCategory,
          date: txn.date,
        });
        const categoryId = result.category ? (leafSlugToId.get(result.category) ?? null) : null;
        hit = { categoryId, categoryConfidence: categoryId ? result.categoryConfidence : undefined };
      } catch (error) {
        // Skip this merchant on a transient classify error (mirrors drainPending) rather than
        // aborting the whole pass — partial progress is already durable and idempotent. Cache null
        // so its other rows this run aren't retried. Log only the txn id (merchant/amount are PII).
        console.error(`[backfill-categories] failed txn=${txn.id}`, error);
        hit = { categoryId: null };
        failed += 1;
      }
      resolved.set(key, hit);
    }
    if (hit.categoryId) {
      const [row] = await repo.transactions.setBackfilledCategory(txn.id, {
        categoryId: hit.categoryId,
        categoryConfidence: hit.categoryConfidence,
      });
      if (row) backfilled += 1;
    }
  }

  return { scanned: candidates.length, backfilled, failed };
}
