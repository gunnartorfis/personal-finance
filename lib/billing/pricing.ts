/** Subscription pricing (ADR-0006): 1990 ISK/month, annual billed at 30% off. Whole ISK krónur. */
export const MONTHLY_PRICE_ISK = 1990;

/** Annual discount applied to 12× the monthly price. */
export const ANNUAL_DISCOUNT = 0.3;

export type BillingPeriod = "monthly" | "annual";

/** Whole-ISK price for a billing period; annual = 12 months less the discount, rounded. */
export function subscriptionPriceISK(period: BillingPeriod): number {
  if (period === "annual") {
    return Math.round(MONTHLY_PRICE_ISK * 12 * (1 - ANNUAL_DISCOUNT));
  }
  return MONTHLY_PRICE_ISK;
}

/** Runtime guard for the billing period from a request body. */
export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === "monthly" || value === "annual";
}
