import { describe, expect, it } from "vitest";

import { isBillingPeriod, MONTHLY_PRICE_ISK, subscriptionPriceISK } from "./pricing";

describe("subscriptionPriceISK", () => {
  it("is 1990 ISK for monthly", () => {
    expect(subscriptionPriceISK("monthly")).toBe(MONTHLY_PRICE_ISK);
    expect(subscriptionPriceISK("monthly")).toBe(1990);
  });

  it("is 12 months less 30% for annual (rounded whole ISK)", () => {
    // 1990 * 12 * 0.7 = 16716
    expect(subscriptionPriceISK("annual")).toBe(16716);
  });
});

describe("isBillingPeriod", () => {
  it("accepts the two periods and rejects anything else", () => {
    expect(isBillingPeriod("monthly")).toBe(true);
    expect(isBillingPeriod("annual")).toBe(true);
    expect(isBillingPeriod("weekly")).toBe(false);
    expect(isBillingPeriod(null)).toBe(false);
    expect(isBillingPeriod(12)).toBe(false);
  });
});
