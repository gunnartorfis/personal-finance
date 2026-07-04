import { describe, expect, it } from "vitest";

import { computeBalanceCheck } from "./balance-check";

describe("computeBalanceCheck", () => {
  it("matches with zero drift when derived equals expected", () => {
    expect(computeBalanceCheck({ expected: 150_000, derived: 150_000 })).toEqual({
      expected: 150_000,
      derived: 150_000,
      drift: 0,
      matches: true,
    });
  });

  it("reports a positive drift when transactions fall short (a likely missing row)", () => {
    const check = computeBalanceCheck({ expected: 150_000, derived: 120_000 });
    expect(check.drift).toBe(30_000);
    expect(check.matches).toBe(false);
  });

  it("reports a negative drift when transactions overshoot (a likely duplicate)", () => {
    const check = computeBalanceCheck({ expected: 100_000, derived: 130_000 });
    expect(check.drift).toBe(-30_000);
    expect(check.matches).toBe(false);
  });

  it("matches within an explicit tolerance", () => {
    expect(computeBalanceCheck({ expected: 100_000, derived: 99_950, tolerance: 100 }).matches).toBe(true);
    expect(computeBalanceCheck({ expected: 100_000, derived: 99_800, tolerance: 100 }).matches).toBe(false);
  });

  it("defaults to an exact (zero-tolerance) check", () => {
    expect(computeBalanceCheck({ expected: 100_000, derived: 99_999 }).matches).toBe(false);
  });

  it("handles negative expected balances (overdraft / card debt)", () => {
    const check = computeBalanceCheck({ expected: -50_000, derived: -50_000 });
    expect(check).toEqual({ expected: -50_000, derived: -50_000, drift: 0, matches: true });
  });
});
