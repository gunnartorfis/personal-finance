import type { BillingPeriod } from "./pricing";

/**
 * Add whole months in UTC, clamping to the end of the target month so a day that doesn't exist
 * there doesn't overflow into the next one (Jan 31 + 1mo → Feb 28/29, not Mar 3 — which would give
 * a free month). Non-mutating.
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1); // avoid overflow while changing the month
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/**
 * The next renewal date for a billing period (ADR-0006): one month out for monthly, one year
 * (12 months) for annual, with month-end clamping.
 */
export function nextRenewal(now: Date, period: BillingPeriod): Date {
  return addMonths(now, period === "annual" ? 12 : 1);
}
