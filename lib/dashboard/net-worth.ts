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
 * Fold balance snapshots into {@link NetWorth}: keep the latest snapshot per Account (newest `asOf`),
 * then sum their balances. `null` for no snapshots. Accepts multiple snapshots per Account and
 * dedupes them, so it is correct whether fed the repo's already-latest-per-account rows (the sole
 * caller today) or raw history.
 *
 * On an exact `asOf` tie the later entry in `snapshots` wins. For raw history that means the caller
 * must order snapshots oldest-first (the repo's `latestPerAccount` already resolves ties by
 * `created_at`, so its output — at most one row per Account — is unaffected by this rule).
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

/** One Account with its latest recorded balance (or `null` if none yet) — for the entry form. */
export interface AccountBalance {
  id: string;
  name: string;
  /** Latest recorded balance in whole billing-currency units, or `null` when none is recorded. */
  balance: number | null;
}

/**
 * Everything the net-worth panel needs in one pass: the Household's net worth (`null` until a balance
 * exists) and every Account with its latest recorded balance to prefill the entry form. Reads the
 * Account list and the latest-per-account snapshots together so the panel and form never disagree.
 */
export async function loadNetWorthPanel(
  repo: HouseholdRepo,
): Promise<{ netWorth: NetWorth | null; accounts: AccountBalance[] }> {
  const [accountList, latest] = await Promise.all([
    repo.accounts.list(),
    repo.accounts.balances.latestPerAccount(),
  ]);
  const balanceByAccount = new Map(latest.map((row) => [row.accountId, row.balance]));
  const accounts = accountList.map((account) => ({
    id: account.id,
    name: account.name,
    balance: balanceByAccount.get(account.id) ?? null,
  }));
  const netWorth = computeNetWorth(
    latest.map((row) => ({ accountId: row.accountId, balance: row.balance, asOf: row.asOf })),
  );
  return { netWorth, accounts };
}

/**
 * Runway in whole months (ADR-0016): how long net worth covers the Household's monthly burn if income
 * stopped — `netWorth / monthlyBurn`, rounded down so it never overstates. `null` when there is no
 * net worth, no burn figure (thin history), or burn is non-positive (nothing being spent, so runway
 * is not meaningful). Also `null` when net worth is zero or negative — there is no runway to report.
 */
export function computeRunwayMonths(
  netWorthTotal: number,
  monthlyBurn: number | null,
): number | null {
  if (monthlyBurn === null || monthlyBurn <= 0) return null;
  if (netWorthTotal <= 0) return null;
  return Math.floor(netWorthTotal / monthlyBurn);
}
