/**
 * Net math for a Household (ADR-0004).
 *
 * Every Transaction carries a charged amount in the Account's billing currency — the
 * amount the card was actually billed. That charged amount is the SOLE source of truth
 * for all net profit/loss math. A foreign `original` amount (e.g. `-10.21 USD`) is stored
 * for display only and is never summed.
 *
 * v1 assumes a single billing currency per Household: there is no FX engine, so summing
 * amounts charged in different currencies is rejected rather than silently converted.
 */

/** An amount of money in a specific currency. */
export interface Money {
  /** Negative = expense, positive = credit. In the currency's natural units. */
  amount: number;
  /** ISO 4217 currency code, e.g. "ISK", "USD". */
  currency: string;
}

/** A Transaction's amounts: `charged` drives net math; `original` is display-only. */
export interface ChargedAmount {
  /** The amount billed in the Account's billing currency. The source of truth. */
  charged: Money;
  /** The pre-conversion foreign amount, shown for context only — never summed. */
  original?: Money;
}

/** Thrown when net math is asked to sum amounts in more than one billing currency. */
export class MixedCurrencyError extends Error {
  constructor(expected: string, found: string) {
    super(`cannot sum mixed billing currencies: expected ${expected}, found ${found}`);
    this.name = "MixedCurrencyError";
  }
}

/**
 * Sum the charged amounts of `items`, all of which must be billed in `billingCurrency`.
 * Credits add and expenses subtract. The foreign `original` amount is ignored. Throws
 * {@link MixedCurrencyError} if any item is charged in a different currency (no FX in v1).
 */
export function netTotal(items: ChargedAmount[], billingCurrency: string): number {
  let total = 0;
  for (const item of items) {
    if (item.charged.currency !== billingCurrency) {
      throw new MixedCurrencyError(billingCurrency, item.charged.currency);
    }
    total += item.charged.amount;
  }
  return total;
}
