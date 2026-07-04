import { TYPES, type RealType } from "@/shared/types";

/** A validated per-category budget ready for `repo.budgets.replace` (household stamped by the repo). */
export interface BudgetInput {
  expenseType: RealType;
  monthlyAmount: number;
}

export type BudgetParseResult =
  | { ok: true; value: BudgetInput[] }
  | { ok: false; error: string };

function isRealType(value: unknown): value is RealType {
  return typeof value === "string" && (TYPES as readonly string[]).includes(value);
}

/**
 * Validate a budgets PUT body — `{ budgets: [{ expenseType, monthlyAmount }] }` — mirroring the
 * `category_budgets` DB constraints so a bad request is a clean 400: each `expenseType` is a real
 * bucketed type (never ""), each `monthlyAmount` a positive integer, and no type repeats. An empty
 * list is valid (clears all budgets).
 */
export function parseBudgetInput(body: unknown): BudgetParseResult {
  if (typeof body !== "object" || body === null || !Array.isArray((body as Record<string, unknown>).budgets)) {
    return { ok: false, error: "expected { budgets: [] }" };
  }
  const rows = (body as { budgets: unknown[] }).budgets;
  const value: BudgetInput[] = [];
  const seen = new Set<RealType>();

  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      return { ok: false, error: "each budget must be an object" };
    }
    const { expenseType, monthlyAmount } = row as Record<string, unknown>;
    if (!isRealType(expenseType)) {
      return { ok: false, error: "expenseType must be Fixed, Necessary, or Nice to have" };
    }
    if (seen.has(expenseType)) {
      return { ok: false, error: `duplicate budget for ${expenseType}` };
    }
    if (typeof monthlyAmount !== "number" || !Number.isInteger(monthlyAmount) || monthlyAmount <= 0) {
      return { ok: false, error: "monthlyAmount must be a positive integer" };
    }
    seen.add(expenseType);
    value.push({ expenseType, monthlyAmount });
  }

  return { ok: true, value };
}
