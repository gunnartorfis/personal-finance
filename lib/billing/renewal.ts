import type { BillingPeriod } from "./pricing";

/**
 * The next renewal date for a billing period (ADR-0006): one month out for monthly, one year for
 * annual. Computed in UTC for determinism; month/year overflow follows JS Date semantics.
 */
export function nextRenewal(now: Date, period: BillingPeriod): Date {
  const next = new Date(now.getTime());
  if (period === "annual") {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}
