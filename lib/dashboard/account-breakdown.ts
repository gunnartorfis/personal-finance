import type { HouseholdRepo } from "@/lib/db/household-repo";

/**
 * One Account's share of a period's spend (Phase K, ADR-0008). `spending` is the account's debit
 * magnitude and `share` its fraction (0..1) of the period's total spend across all Accounts. The
 * module is shown only when the Household has more than one Account (decided by the caller).
 */
export interface AccountSpend {
  accountId: string;
  name: string;
  spending: number;
  share: number;
}

/** A raw per-account debit total as returned by the repo. */
export interface AccountSpendRow {
  accountId: string;
  name: string;
  spending: number;
}

/**
 * Fold raw per-account totals into the breakdown: add each account's share of the total and sort by
 * spend descending (name tie-break, code-unit so it's environment-independent). Pure and unit-tested
 * directly; the read lives in {@link loadAccountBreakdown}.
 */
export function buildAccountBreakdown(
  rows: ReadonlyArray<AccountSpendRow>,
): AccountSpend[] {
  const total = rows.reduce((sum, row) => sum + row.spending, 0);
  return rows
    .map((row) => ({ ...row, share: total > 0 ? row.spending / total : 0 }))
    .sort((a, b) => b.spending - a.spending || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Load the per-Account spend breakdown for the Household over a half-open range `[from, to)`. */
export async function loadAccountBreakdown(
  repo: HouseholdRepo,
  range: { from: string; to: string },
): Promise<AccountSpend[]> {
  const rows = await repo.transactions.spendByAccount(range);
  return buildAccountBreakdown(rows);
}
