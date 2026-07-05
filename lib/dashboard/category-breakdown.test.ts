import { describe, expect, it } from "vitest";

import {
  computeCategoryBreakdown,
  rankCategoryBreakdown,
  type CategoryBreakdown,
  type CategoryBreakdownRow,
} from "./category-breakdown";

const row = (partial: Partial<CategoryBreakdownRow>): CategoryBreakdownRow => ({
  amount: -1000,
  categoryId: null,
  ...partial,
});

describe("computeCategoryBreakdown (ADR-0020)", () => {
  it("buckets expenses by category_id and collects the rest as uncategorized", () => {
    const result = computeCategoryBreakdown([
      row({ amount: -4200, categoryId: "groceries" }),
      row({ amount: -1500, categoryId: "groceries" }),
      row({ amount: -3000, categoryId: "fuel" }),
      row({ amount: -900, categoryId: null }),
    ]);
    expect(result.byCategory).toEqual({ groceries: -5700, fuel: -3000 });
    expect(result.uncategorized).toBe(-900);
    expect(result.expense).toBe(-9600);
  });

  it("holds the reconciliation invariant sum(byCategory) + uncategorized === expense", () => {
    const result = computeCategoryBreakdown([
      row({ amount: -100, categoryId: "a" }),
      row({ amount: -250, categoryId: "b" }),
      row({ amount: -75, categoryId: null }),
    ]);
    const summed = Object.values(result.byCategory).reduce((a, b) => a + b, 0) + result.uncategorized;
    expect(summed).toBe(result.expense);
  });

  it("ignores credits on the spend axis", () => {
    const result = computeCategoryBreakdown([
      row({ amount: 500000, categoryId: null }), // marked-income-sized credit
      row({ amount: 2000, categoryId: "groceries" }), // credit, ignored
      row({ amount: -4200, categoryId: "groceries" }),
    ]);
    expect(result.expense).toBe(-4200);
    expect(result.byCategory).toEqual({ groceries: -4200 });
    expect(result.uncategorized).toBe(0);
  });

  it("returns empty buckets for no rows", () => {
    expect(computeCategoryBreakdown([])).toEqual({ expense: 0, byCategory: {}, uncategorized: 0 });
  });
});

const breakdown = (partial: Partial<CategoryBreakdown>): CategoryBreakdown => ({
  expense: 0,
  byCategory: {},
  uncategorized: 0,
  ...partial,
});

describe("rankCategoryBreakdown (ADR-0020, S5b)", () => {
  it("ranks categories by magnitude desc, carrying each row's share of total spend", () => {
    const result = rankCategoryBreakdown(
      breakdown({ expense: -10000, byCategory: { groceries: -6000, fuel: -4000 } }),
    );
    expect(result.total).toBe(10000);
    expect(result.rows).toEqual([
      { kind: "category", categoryId: "groceries", magnitude: 6000, share: 0.6 },
      { kind: "category", categoryId: "fuel", magnitude: 4000, share: 0.4 },
    ]);
  });

  it("collapses the tail beyond topN into a single 'other' row", () => {
    const result = rankCategoryBreakdown(
      breakdown({
        expense: -1000,
        byCategory: { a: -500, b: -300, c: -150, d: -50 },
      }),
      { topN: 2 },
    );
    expect(result.rows).toEqual([
      { kind: "category", categoryId: "a", magnitude: 500, share: 0.5 },
      { kind: "category", categoryId: "b", magnitude: 300, share: 0.3 },
      { kind: "other", count: 2, magnitude: 200, share: 0.2 },
    ]);
  });

  it("appends an 'uncategorized' row last when there is uncategorized spend", () => {
    const result = rankCategoryBreakdown(
      breakdown({ expense: -1000, byCategory: { a: -600 }, uncategorized: -400 }),
    );
    expect(result.rows).toEqual([
      { kind: "category", categoryId: "a", magnitude: 600, share: 0.6 },
      { kind: "uncategorized", magnitude: 400, share: 0.4 },
    ]);
  });

  it("orders topN rows, then the 'other' tail, then 'uncategorized' when all three coexist", () => {
    const result = rankCategoryBreakdown(
      breakdown({ expense: -1000, byCategory: { a: -500, b: -300 }, uncategorized: -200 }),
      { topN: 1 },
    );
    expect(result.rows).toEqual([
      { kind: "category", categoryId: "a", magnitude: 500, share: 0.5 },
      { kind: "other", count: 1, magnitude: 300, share: 0.3 },
      { kind: "uncategorized", magnitude: 200, share: 0.2 },
    ]);
  });

  it("breaks magnitude ties deterministically by category id", () => {
    const result = rankCategoryBreakdown(
      breakdown({ expense: -2000, byCategory: { zebra: -1000, apple: -1000 } }),
    );
    expect(result.rows.map((r) => (r.kind === "category" ? r.categoryId : r.kind))).toEqual([
      "apple",
      "zebra",
    ]);
  });

  it("returns no rows and zero total when there is no spend", () => {
    expect(rankCategoryBreakdown(breakdown({}))).toEqual({ rows: [], total: 0 });
  });
});
