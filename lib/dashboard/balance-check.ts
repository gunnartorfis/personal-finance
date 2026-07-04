import type { HouseholdRepo } from "@/lib/db/household-repo";

/**
 * Compare an Account's expected balance (a statement/manual snapshot) against the balance derived
 * from its imported transactions, to catch missing or duplicate rows (#98). Deliberately named
 * "balance check" — NOT "reconcile/reconciliation", which already names the net-summary math
 * invariant (CONTEXT.md, ADR-0011) and the Excluded gesture.
 */

/** The outcome of a balance check for one Account. */
export interface BalanceCheck {
  /** The snapshot balance the transactions should add up to. */
  expected: number;
  /** The balance derived from imported transactions (opening balance + signed sum). */
  derived: number;
  /** `expected - derived`: positive means transactions fall short (likely a missing row); negative
   *  means they overshoot (likely a duplicate). Zero when they agree. */
  drift: number;
  /** Whether the drift is within tolerance — the account's transactions explain its balance. */
  matches: boolean;
}

/**
 * Fold an expected vs derived balance into a {@link BalanceCheck}. Pure and side-effect free; the
 * repo reads (the snapshot and the signed transaction sum that produce `derived`) live in the
 * loader. `drift = expected - derived`; the account balances when `|drift| <= tolerance`
 * (default 0 — an exact check).
 */
export function computeBalanceCheck(input: {
  expected: number;
  derived: number;
  tolerance?: number;
}): BalanceCheck {
  // Clamp so a stray negative tolerance can't make an exact match report as a mismatch.
  const tolerance = Math.max(0, input.tolerance ?? 0);
  const drift = input.expected - input.derived;
  return {
    expected: input.expected,
    derived: input.derived,
    drift,
    matches: Math.abs(drift) <= tolerance,
  };
}

/** A balance check for one Account, carrying its name for display. */
export interface AccountBalanceCheck {
  accountId: string;
  name: string;
  check: BalanceCheck;
}

/** The `YYYY-MM-DD` of a snapshot's `asOf` timestamp (UTC), for the date-only transaction window. */
function asOfDate(asOf: Date): string {
  return asOf.toISOString().slice(0, 10);
}

/** The day after `date` (`YYYY-MM-DD`, UTC) — for a half-open `[from, to)` window that includes `date`. */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Balance-check every Account that has at least two balance snapshots (#98): between its two most
 * recent snapshots, the signed sum of its transactions should equal the balance change. A drift
 * means a missing (positive) or duplicate (negative) row. Accounts with fewer than two snapshots are
 * skipped (no window to check). The transaction window is `(previous asOf, latest asOf]`, mapped onto
 * the date-only transaction dates. The reads live here; the comparison is the pure
 * {@link computeBalanceCheck}.
 */
export async function loadBalanceChecks(
  repo: HouseholdRepo,
  tolerance = 0,
): Promise<AccountBalanceCheck[]> {
  const [snapshots, accounts] = await Promise.all([
    repo.accounts.balances.list(),
    repo.accounts.list(),
  ]);
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  // Snapshots arrive grouped by account, oldest first.
  const byAccount = new Map<string, Array<{ asOf: Date; balance: number }>>();
  for (const snapshot of snapshots) {
    const list = byAccount.get(snapshot.accountId) ?? [];
    list.push({ asOf: snapshot.asOf, balance: snapshot.balance });
    byAccount.set(snapshot.accountId, list);
  }

  const results: AccountBalanceCheck[] = [];
  for (const [accountId, list] of byAccount) {
    if (list.length < 2) continue;
    const previous = list[list.length - 2];
    const latest = list[list.length - 1];
    const range = { from: nextDay(asOfDate(previous.asOf)), to: nextDay(asOfDate(latest.asOf)) };
    const net = (await repo.transactions.netByAccount(range)).find((r) => r.accountId === accountId);
    const check = computeBalanceCheck({
      expected: latest.balance - previous.balance,
      derived: net?.net ?? 0,
      tolerance,
    });
    results.push({ accountId, name: nameById.get(accountId) ?? "", check });
  }
  return results;
}
