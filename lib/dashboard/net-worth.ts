import type { HouseholdRepo } from "@/lib/db/household-repo";

/**
 * Net worth for a Household (ADR-0016): the sum of the latest balance snapshot across its Accounts.
 * Balances are append-only observations (manual entry now, bank-balance sync later), so "current"
 * means the newest snapshot per Account. Amounts are whole billing-currency units (ADR-0004) and may
 * be negative — an overdraft or credit-card balance is real debt that reduces net worth.
 *
 * The fold is pure so it unit-tests directly (mirroring the other `lib/dashboard` selectors); the
 * read lives in {@link loadNetWorth}. `null` when the Household has no balance snapshot at all — the
 * caller hides the net-worth / runway tiles until a balance is entered.
 */

/** One balance observation for an Account — the input to {@link computeNetWorth}. */
export interface BalanceSnapshot {
  accountId: string;
  /** Whole billing-currency units; negative for overdrafts / card debt. */
  balance: number;
  /** When the balance was observed; the newest per Account wins. */
  asOf: Date;
}

export interface NetWorth {
  /** Sum of the latest balance across Accounts with a snapshot; may be negative. */
  total: number;
  /** How many Accounts contributed a balance. */
  accountCount: number;
  /** The most recent `asOf` across the contributing snapshots — "as of" for the displayed total. */
  asOf: Date;
}

/**
 * Fold balance snapshots into {@link NetWorth}: keep the latest snapshot per Account (newest `asOf`;
 * a later entry in the list breaks an exact tie, matching the repo's `created_at` tiebreak), then sum
 * their balances. `null` for no snapshots. Accepts multiple snapshots per Account and dedupes them,
 * so it is correct whether fed raw history or the repo's already-latest-per-account rows.
 */
export function computeNetWorth(snapshots: ReadonlyArray<BalanceSnapshot>): NetWorth | null {
  if (snapshots.length === 0) return null;

  const latest = new Map<string, BalanceSnapshot>();
  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.accountId);
    if (!current || snapshot.asOf.getTime() >= current.asOf.getTime()) {
      latest.set(snapshot.accountId, snapshot);
    }
  }

  let total = 0;
  let asOf = 0;
  for (const snapshot of latest.values()) {
    total += snapshot.balance;
    asOf = Math.max(asOf, snapshot.asOf.getTime());
  }
  return { total, accountCount: latest.size, asOf: new Date(asOf) };
}

/** Load the Household's net worth from its latest per-Account balance snapshots; `null` when none. */
export async function loadNetWorth(repo: HouseholdRepo): Promise<NetWorth | null> {
  const rows = await repo.accounts.balances.latestPerAccount();
  return computeNetWorth(rows.map((row) => ({ accountId: row.accountId, balance: row.balance, asOf: row.asOf })));
}
