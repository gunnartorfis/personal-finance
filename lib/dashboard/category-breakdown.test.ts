import { describe, expect, it } from "vitest";

import { computeCategoryBreakdown, type CategoryBreakdownRow } from "./category-breakdown";

const row = (partial: Partial<CategoryBreakdownRow>): CategoryBreakdownRow => ({
  amount: -1000,
  incomeMarked: false,
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

  it("ignores credits (marked income and unmarked alike) on the spend axis", () => {
    const result = computeCategoryBreakdown([
      row({ amount: 500000, incomeMarked: true, categoryId: null }),
      row({ amount: 2000, incomeMarked: false, categoryId: "groceries" }), // credit, ignored
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
