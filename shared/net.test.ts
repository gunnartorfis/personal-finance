import { describe, expect, it } from "vitest";

import { MixedCurrencyError, netTotal, type ChargedAmount } from "./net.ts";

/** A transaction charged in ISK (the common single-currency case). */
const isk = (amount: number): ChargedAmount => ({ charged: { amount, currency: "ISK" } });

describe("netTotal", () => {
  it("is 0 when there are no transactions", () => {
    expect(netTotal([], "ISK")).toBe(0);
  });

  it("sums charged amounts, with credits adding and expenses subtracting", () => {
    // two expenses and one salary credit
    expect(netTotal([isk(-2979), isk(-1323), isk(500000)], "ISK")).toBe(495698);
  });

  it("counts only the charged amount, never the foreign original amount", () => {
    // CONVEX -10.21 USD settled as -1.323 kr.: only the ISK charge is real money to us.
    const foreign: ChargedAmount = {
      charged: { amount: -1323, currency: "ISK" },
      original: { amount: -10.21, currency: "USD" },
    };
    expect(netTotal([foreign], "ISK")).toBe(-1323);
  });

  it("rejects summing a transaction charged in a different currency (no FX in v1)", () => {
    const items: ChargedAmount[] = [isk(-1000), { charged: { amount: -5, currency: "USD" } }];
    expect(() => netTotal(items, "ISK")).toThrow(MixedCurrencyError);
  });
});
