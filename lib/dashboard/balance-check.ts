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
  const tolerance = input.tolerance ?? 0;
  const drift = input.expected - input.derived;
  return {
    expected: input.expected,
    derived: input.derived,
    drift,
    matches: Math.abs(drift) <= tolerance,
  };
}
