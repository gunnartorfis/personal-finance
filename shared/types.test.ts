import { describe, expect, it } from "vitest";

import { EXPENSE_TYPES, isExpenseType } from "./types.ts";

describe("isExpenseType", () => {
  it("accepts every valid expense type, including the empty not-bucketed type", () => {
    for (const t of EXPENSE_TYPES) {
      expect(isExpenseType(t)).toBe(true);
    }
    expect(isExpenseType("")).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isExpenseType("Splurge")).toBe(false);
    expect(isExpenseType("fixed")).toBe(false); // case-sensitive
    expect(isExpenseType(null)).toBe(false);
    expect(isExpenseType(undefined)).toBe(false);
    expect(isExpenseType(42)).toBe(false);
  });
});
