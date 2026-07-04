import { describe, expect, it } from "vitest";

import { parseBudgetInput } from "./parse";

describe("parseBudgetInput", () => {
  it("accepts a valid budgets list", () => {
    const result = parseBudgetInput({
      budgets: [
        { expenseType: "Fixed", monthlyAmount: 200_000 },
        { expenseType: "Nice to have", monthlyAmount: 30_000 },
      ],
    });
    expect(result).toEqual({
      ok: true,
      value: [
        { expenseType: "Fixed", monthlyAmount: 200_000 },
        { expenseType: "Nice to have", monthlyAmount: 30_000 },
      ],
    });
  });

  it("accepts an empty list (clears all budgets)", () => {
    expect(parseBudgetInput({ budgets: [] })).toEqual({ ok: true, value: [] });
  });

  it("rejects a non-object body", () => {
    expect(parseBudgetInput(null).ok).toBe(false);
    expect(parseBudgetInput({}).ok).toBe(false);
  });

  it("rejects an unknown expense type", () => {
    const result = parseBudgetInput({ budgets: [{ expenseType: "Splurge", monthlyAmount: 100 }] });
    expect(result.ok).toBe(false);
  });

  it("rejects the not-bucketed empty type", () => {
    const result = parseBudgetInput({ budgets: [{ expenseType: "", monthlyAmount: 100 }] });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-positive or non-integer amount", () => {
    expect(parseBudgetInput({ budgets: [{ expenseType: "Fixed", monthlyAmount: 0 }] }).ok).toBe(false);
    expect(parseBudgetInput({ budgets: [{ expenseType: "Fixed", monthlyAmount: -5 }] }).ok).toBe(false);
    expect(parseBudgetInput({ budgets: [{ expenseType: "Fixed", monthlyAmount: 1.5 }] }).ok).toBe(false);
  });

  it("rejects duplicate expense types", () => {
    const result = parseBudgetInput({
      budgets: [
        { expenseType: "Fixed", monthlyAmount: 100 },
        { expenseType: "Fixed", monthlyAmount: 200 },
      ],
    });
    expect(result.ok).toBe(false);
  });
});
