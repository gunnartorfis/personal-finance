import { describe, expect, it } from "vitest";

import { computeBudgetStatus } from "./budget-status";

describe("computeBudgetStatus", () => {
  it("reports an under-budget envelope as ok with the remaining amount", () => {
    const status = computeBudgetStatus({ Fixed: 100_000 }, { Fixed: 40_000 });
    expect(status.envelopes).toEqual([
      { type: "Fixed", budget: 100_000, spent: 40_000, remaining: 60_000, ratio: 0.4, level: "ok" },
    ]);
    expect(status).toMatchObject({ totalBudget: 100_000, totalSpent: 40_000, totalRemaining: 60_000 });
  });

  it("flags an envelope at/above the warn threshold as warning", () => {
    const [envelope] = computeBudgetStatus({ Necessary: 10_000 }, { Necessary: 8_500 }).envelopes;
    expect(envelope.level).toBe("warning");
  });

  it("flags an over-budget envelope as over with negative remaining", () => {
    const [envelope] = computeBudgetStatus({ "Nice to have": 5_000 }, { "Nice to have": 7_000 }).envelopes;
    expect(envelope).toMatchObject({ level: "over", remaining: -2_000 });
  });

  it("treats a category with spend but no budget entry as un-budgeted (omitted)", () => {
    const status = computeBudgetStatus({ Fixed: 10_000 }, { Fixed: 5_000, Necessary: 9_999 });
    expect(status.envelopes.map((e) => e.type)).toEqual(["Fixed"]);
  });

  it("ignores non-positive budgets", () => {
    const status = computeBudgetStatus({ Fixed: 0, Necessary: 10_000 }, { Necessary: 1_000 });
    expect(status.envelopes.map((e) => e.type)).toEqual(["Necessary"]);
  });

  it("counts zero spend for a budgeted category with no spend", () => {
    const [envelope] = computeBudgetStatus({ Fixed: 10_000 }, {}).envelopes;
    expect(envelope).toMatchObject({ spent: 0, remaining: 10_000, level: "ok" });
  });

  it("orders envelopes by the canonical expense-type order and totals across them", () => {
    const status = computeBudgetStatus(
      { "Nice to have": 5_000, Fixed: 20_000, Necessary: 10_000 },
      { "Nice to have": 6_000, Fixed: 5_000, Necessary: 10_000 },
    );
    expect(status.envelopes.map((e) => e.type)).toEqual(["Fixed", "Necessary", "Nice to have"]);
    expect(status).toMatchObject({
      totalBudget: 35_000,
      totalSpent: 21_000,
      totalRemaining: 14_000,
    });
  });
});
