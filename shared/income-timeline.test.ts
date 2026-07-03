import { describe, expect, it } from "vitest";

import { amountInForce, resolveCycleAmounts, type EffectiveAmount } from "./income-timeline.ts";

describe("amountInForce", () => {
  it("is 0 for a source with no versions", () => {
    expect(amountInForce([], "2026-03")).toBe(0);
  });

  it("is 0 for a cycle before the source's earliest version (not yet started)", () => {
    const versions: EffectiveAmount[] = [{ amount: 500_000, effectiveFrom: "2026-03" }];
    expect(amountInForce(versions, "2026-02")).toBe(0);
  });

  it("applies a version from its effective cycle onward", () => {
    const versions: EffectiveAmount[] = [{ amount: 500_000, effectiveFrom: "2026-03" }];
    expect(amountInForce(versions, "2026-03")).toBe(500_000);
    expect(amountInForce(versions, "2026-09")).toBe(500_000);
  });

  it("uses the latest version in force, regardless of input order", () => {
    const versions: EffectiveAmount[] = [
      { amount: 600_000, effectiveFrom: "2026-07" },
      { amount: 500_000, effectiveFrom: "2026-01" },
    ];
    expect(amountInForce(versions, "2026-06")).toBe(500_000);
    expect(amountInForce(versions, "2026-07")).toBe(600_000);
  });

  it("honours a version that steps the amount to zero (a job ends, a loan cleared)", () => {
    const versions: EffectiveAmount[] = [
      { amount: 500_000, effectiveFrom: "2026-01" },
      { amount: 0, effectiveFrom: "2026-05" },
    ];
    expect(amountInForce(versions, "2026-04")).toBe(500_000);
    expect(amountInForce(versions, "2026-05")).toBe(0);
  });
});

const EMPTY = {
  incomeSources: [],
  offcardCostSources: [],
  incomeOneOffs: [],
  costOneOffs: [],
} as const;

describe("resolveCycleAmounts", () => {
  it("resolves every requested cycle to zeros when there is no data", () => {
    const resolved = resolveCycleAmounts(EMPTY, ["2026-01", "2026-02"]);
    expect(resolved.get("2026-01")).toEqual({ monthlyIncome: 0, offCardFixed: 0 });
    expect(resolved.get("2026-02")).toEqual({ monthlyIncome: 0, offCardFixed: 0 });
  });

  it("returns an empty map for no cycles", () => {
    expect(resolveCycleAmounts(EMPTY, []).size).toBe(0);
  });

  it("sums income and off-card cost sources in force at each cycle", () => {
    const resolved = resolveCycleAmounts(
      {
        ...EMPTY,
        incomeSources: [[{ amount: 500_000, effectiveFrom: "2026-01" }]],
        offcardCostSources: [[{ amount: 250_000, effectiveFrom: "2026-01" }]],
      },
      ["2026-03"],
    );
    expect(resolved.get("2026-03")).toEqual({ monthlyIncome: 500_000, offCardFixed: 250_000 });
  });

  it("advances each source on its own timeline (a raise while rental income is steady)", () => {
    const resolved = resolveCycleAmounts(
      {
        ...EMPTY,
        incomeSources: [
          [
            { amount: 500_000, effectiveFrom: "2026-01" },
            { amount: 600_000, effectiveFrom: "2026-07" },
          ],
          [{ amount: 100_000, effectiveFrom: "2026-01" }],
        ],
      },
      ["2026-06", "2026-07"],
    );
    expect(resolved.get("2026-06")!.monthlyIncome).toBe(600_000); // 500k salary + 100k rental
    expect(resolved.get("2026-07")!.monthlyIncome).toBe(700_000); // 600k salary + 100k rental
  });

  it("stacks a one-off income adjustment on top of that cycle's recurring base only", () => {
    const resolved = resolveCycleAmounts(
      {
        ...EMPTY,
        incomeSources: [[{ amount: 500_000, effectiveFrom: "2026-01" }]],
        incomeOneOffs: [{ cycleKey: "2026-03", amount: 300_000 }], // a tax refund
      },
      ["2026-02", "2026-03"],
    );
    expect(resolved.get("2026-02")!.monthlyIncome).toBe(500_000);
    expect(resolved.get("2026-03")!.monthlyIncome).toBe(800_000);
  });

  it("adds a one-off cost adjustment to the cycle it lands on", () => {
    const resolved = resolveCycleAmounts(
      { ...EMPTY, costOneOffs: [{ cycleKey: "2026-04", amount: 90_000 }] }, // annual insurance
      ["2026-04"],
    );
    expect(resolved.get("2026-04")).toEqual({ monthlyIncome: 0, offCardFixed: 90_000 });
  });

  it("counts a one-off even when the cycle has no recurring base", () => {
    const resolved = resolveCycleAmounts(
      { ...EMPTY, incomeOneOffs: [{ cycleKey: "2026-05", amount: 50_000 }] },
      ["2026-05"],
    );
    expect(resolved.get("2026-05")!.monthlyIncome).toBe(50_000);
  });

  it("sums multiple one-offs landing on the same cycle", () => {
    const resolved = resolveCycleAmounts(
      {
        ...EMPTY,
        incomeOneOffs: [
          { cycleKey: "2026-06", amount: 50_000 },
          { cycleKey: "2026-06", amount: 20_000 },
          { cycleKey: "2026-07", amount: 999 },
        ],
      },
      ["2026-06"],
    );
    expect(resolved.get("2026-06")!.monthlyIncome).toBe(70_000);
  });
});
