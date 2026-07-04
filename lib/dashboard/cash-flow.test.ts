import { describe, expect, it } from "vitest";

import { projectCashFlow } from "./cash-flow";

describe("projectCashFlow", () => {
  it("anchors at the starting balance with no flow, then applies the monthly net each cycle", () => {
    const { points } = projectCashFlow({
      startingBalance: 100_000,
      monthlyNet: 50_000,
      startCycle: "2026-03",
      months: 3,
    });
    expect(points).toEqual([
      { cycleKey: "2026-03", monthIndex: 0, net: 0, balance: 100_000 },
      { cycleKey: "2026-04", monthIndex: 1, net: 50_000, balance: 150_000 },
      { cycleKey: "2026-05", monthIndex: 2, net: 50_000, balance: 200_000 },
      { cycleKey: "2026-06", monthIndex: 3, net: 50_000, balance: 250_000 },
    ]);
  });

  it("reports the horizon net over the whole window", () => {
    expect(projectCashFlow({ startingBalance: 0, monthlyNet: 50_000, startCycle: "2026-01", months: 12 }).horizonNet).toBe(600_000);
  });

  it("projects a declining balance when the monthly net is negative (overspending)", () => {
    const { points, horizonNet } = projectCashFlow({
      startingBalance: 30_000,
      monthlyNet: -20_000,
      startCycle: "2026-01",
      months: 2,
    });
    expect(points.map((p) => p.balance)).toEqual([30_000, 10_000, -10_000]);
    expect(horizonNet).toBe(-40_000);
  });

  it("rounds fractional projections to whole units", () => {
    const { points } = projectCashFlow({ startingBalance: 0, monthlyNet: 333.4, startCycle: "2026-01", months: 1 });
    expect(points[1].balance).toBe(333);
  });
});
