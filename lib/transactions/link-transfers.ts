import type { HouseholdRepo } from "@/lib/db/household-repo";

import { detectTransferPairs } from "./detect-transfers";

/**
 * Detect inter-account transfers across a Household's transactions and link each pair (issue #97).
 *
 * Orchestration (the DB reads/writes live in the repo, the matching in the pure
 * {@link detectTransferPairs}): load every not-yet-linked, non-excluded row as a candidate, match
 * the pairs, and persist each via {@link HouseholdRepo.transactions.markTransferPair}. Scanning the
 * full unlinked set — not just a single import's rows — means a newly-imported leg pairs with an
 * existing one, so running this after any import also backfills historical transfers. Idempotent:
 * already-linked legs are excluded from the candidate set and `markTransferPair` rejects them anyway,
 * so a re-run links nothing new. Returns how many pairs were linked.
 */
export async function detectAndLinkTransfers(
  repo: HouseholdRepo,
): Promise<{ linked: number }> {
  const rows = await repo.transactions.list();
  const candidates = rows
    .filter((row) => row.transferGroupId === null && !row.excluded)
    .map((row) => ({
      id: row.id,
      accountId: row.accountId,
      amount: row.amount,
      date: row.date,
    }));

  const pairs = detectTransferPairs(candidates);

  let linked = 0;
  for (const pair of pairs) {
    const { rows: updated } = await repo.transactions.markTransferPair(pair.fromId, pair.toId);
    if (updated.length === 2) linked += 1;
  }

  return { linked };
}
