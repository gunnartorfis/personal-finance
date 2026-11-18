import type { HouseholdRepo } from "@/lib/db/household-repo";

import { detectBankTransferPairs, detectTransferPairs } from "./detect-transfers";

/**
 * Detect inter-account transfers across a Household's transactions and link each pair (issue #97).
 *
 * Orchestration (the DB reads/writes live in the repo, the matching in the pure
 * {@link detectTransferPairs}): load every not-yet-linked, non-excluded row as a candidate (filtered
 * in SQL), match the pairs, and persist each via {@link HouseholdRepo.transactions.markTransferPair}.
 * Scanning the full unlinked set — not just a single import's rows — means a newly-imported leg pairs
 * with an existing one, so running this after an import also backfills historical transfers.
 * A monthly bank rerun limits the scan to that month and requires corroborating bank labels.
 * Idempotent: already-linked legs are excluded from the candidate set and `markTransferPair` rejects
 * them anyway, so a re-run links nothing new. Returns how many pairs were linked.
 */
export async function detectAndLinkTransfers(
  repo: HouseholdRepo,
  options?: { bankOnly: true; range?: { from: string; to: string } },
): Promise<{ linked: number }> {
  const candidates = await repo.transactions.transferCandidates(options?.bankOnly, options?.range);
  const pairs = options
    ? detectBankTransferPairs(candidates)
    : detectTransferPairs(candidates);

  let linked = 0;
  for (const pair of pairs) {
    const { rows: updated } = await repo.transactions.markTransferPair(pair.fromId, pair.toId, options?.bankOnly);
    if (updated.length === 2) linked += 1;
  }

  return { linked };
}
