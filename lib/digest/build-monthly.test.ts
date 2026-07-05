import type { CategoryTrendPoint } from "@/lib/dashboard/category-trend";
import type { MonthlySpendPoint } from "@/lib/dashboard/monthly-series";
import type { Mover } from "@/lib/dashboard/movers";
import { describe, expect, it } from "vitest";

import { buildMonthlyDigest, type MonthlyDigestInput } from "./build-monthly";

function point(month: string, spending: number, income: number): MonthlySpendPoint {
  return { month, spending, income, difference: income - spending };
}

function mover(name: string, lastMonth: number, baselineAverage: number): Mover {
  const delta = lastMonth - baselineAverage;
  return {
    name,
    lastMonth,
    baselineAverage,
    delta,
    deltaPct: baselineAverage > 0 ? delta / baselineAverage : null,
  };
}

function byType(
  partial: Partial<CategoryTrendPoint["byExpenseType"]>,
): CategoryTrendPoint["byExpenseType"] {
  return { Fixed: 0, Necessary: 0, "Nice to have": 0, "": 0, ...partial };
}

function input(overrides: Partial<MonthlyDigestInput> = {}): MonthlyDigestInput {
  return {
    cycleKey: "2026-02",
    currency: "ISK",
    cycle: point("2026-02", 200_000, 500_000),
    priorCycle: point("2026-01", 160_000, 500_000),
    byExpenseType: byType({ Fixed: 120_000, Necessary: 50_000, "Nice to have": 30_000 }),
    categoryBreakdown: { expense: 0, byCategory: {}, uncategorized: 0 },
    categories: [],
    movers: [],
    savings: null,
    ...overrides,
  };
}

describe("buildMonthlyDigest", () => {
  it("carries through the cycle's spending, income, difference, key and currency", () => {
    const m = buildMonthlyDigest(input());
    expect(m.cycleKey).toBe("2026-02");
    expect(m.currency).toBe("ISK");
    expect(m.spending).toBe(200_000);
    expect(m.income).toBe(500_000);
    expect(m.difference).toBe(300_000);
  });

  it("computes the spending delta vs the prior cycle (abs + pct)", () => {
    const m = buildMonthlyDigest(input());
    expect(m.spendingDelta).toEqual({ abs: 40_000, pct: 0.25 });
  });

  it("reports a negative delta when spending fell vs the prior cycle", () => {
    const m = buildMonthlyDigest(
      input({ cycle: point("2026-02", 120_000, 500_000), priorCycle: point("2026-01", 160_000, 500_000) }),
    );
    expect(m.spendingDelta).toEqual({ abs: -40_000, pct: -0.25 });
  });

  it("has a null spending delta when there is no prior cycle", () => {
    const m = buildMonthlyDigest(input({ priorCycle: null }));
    expect(m.spendingDelta).toBeNull();
  });

  it("reports a null delta pct when the prior cycle had zero spending", () => {
    const m = buildMonthlyDigest(input({ priorCycle: point("2026-01", 0, 500_000) }));
    expect(m.spendingDelta).toEqual({ abs: 200_000, pct: null });
  });

  it("lists non-zero expense buckets largest first and drops empty ones", () => {
    const m = buildMonthlyDigest(
      input({ byExpenseType: byType({ Fixed: 30_000, Necessary: 90_000, "Nice to have": 0 }) }),
    );
    expect(m.expenseSplit).toEqual([
      { type: "Necessary", amount: 90_000 },
      { type: "Fixed", amount: 30_000 },
    ]);
  });

  it("ranks the top categories, resolves label parts, and folds the tail into 'other' (ADR-0020)", () => {
    const m = buildMonthlyDigest(
      input({
        categoryBreakdown: {
          expense: -10_000,
          byCategory: { g: -6_000, f: -2_500, x: -1_000 },
          uncategorized: -500,
        },
        categories: [
          { id: "g", labelKey: "groceries", label: null },
          { id: "f", labelKey: null, label: "Sundlaug" }, // custom leaf → literal label
          // "x" intentionally has no leaf entry → label parts resolve to null (render falls back)
        ],
      }),
    );
    expect(m.topCategories).toEqual([
      { kind: "category", labelKey: "groceries", label: null, amount: 6_000, share: 0.6 },
      { kind: "category", labelKey: null, label: "Sundlaug", amount: 2_500, share: 0.25 },
      { kind: "category", labelKey: null, label: null, amount: 1_000, share: 0.1 },
      { kind: "uncategorized", amount: 500, share: 0.05 },
    ]);
  });

  it("folds categories beyond the top 5 into a single 'other' row", () => {
    const m = buildMonthlyDigest(
      input({
        categoryBreakdown: {
          expense: -2_100,
          byCategory: { a: -600, b: -500, c: -400, d: -300, e: -200, f: -100 },
          uncategorized: 0,
        },
        categories: [],
      }),
    );
    const other = m.topCategories.find((r) => r.kind === "other");
    expect(other).toEqual({ kind: "other", count: 1, amount: 100, share: 100 / 2100 });
    expect(m.topCategories.filter((r) => r.kind === "category")).toHaveLength(5);
  });

  it("highlights only rising merchants, biggest rise first, capped at three", () => {
    const m = buildMonthlyDigest(
      input({
        movers: [
          mover("Netto", 50_000, 20_000), // +30k
          mover("Salary refund", 0, 10_000), // -10k (falling: excluded)
          mover("Bonus", 90_000, 40_000), // +50k
          mover("Cafe", 12_000, 8_000), // +4k
          mover("Gym", 15_000, 5_000), // +10k
        ],
      }),
    );
    expect(m.topMovers.map((x) => x.name)).toEqual(["Bonus", "Netto", "Gym"]);
    expect(m.topMovers[0]).toEqual({ name: "Bonus", amount: 90_000, delta: 50_000 });
  });

  it("omits the savings block when there is no active goal", () => {
    const m = buildMonthlyDigest(input({ savings: null }));
    expect(m.savings).toBeNull();
  });

  it("includes on-track status + allowed nice-to-have when a goal exists", () => {
    const m = buildMonthlyDigest(input({ savings: { onTrack: true, allowedNiceToHave: 45_000 } }));
    expect(m.savings).toEqual({ onTrack: true, allowedNiceToHave: 45_000 });
  });

  it("flags no activity when the cycle had neither spending nor income", () => {
    const m = buildMonthlyDigest(input({ cycle: point("2026-02", 0, 0), byExpenseType: byType({}) }));
    expect(m.hasActivity).toBe(false);
  });

  it("flags activity when the cycle had spending", () => {
    const m = buildMonthlyDigest(input({ cycle: point("2026-02", 5_000, 0) }));
    expect(m.hasActivity).toBe(true);
  });
});
