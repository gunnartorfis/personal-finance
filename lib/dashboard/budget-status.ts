import { TYPES, type RealType } from "@/shared/types";

/** How a category envelope is tracking against its budget this cycle. */
export type BudgetLevel = "ok" | "warning" | "over";

/** One category budget "envelope": the target, what's been spent, and how it's tracking. */
export interface BudgetEnvelope {
  type: RealType;
  /** Monthly budget magnitude (positive). */
  budget: number;
  /** Spend magnitude so far this cycle (positive). */
  spent: number;
  /** `budget - spent`; negative once over budget. */
  remaining: number;
  /** `spent / budget` (0..∞); 0 when budget is 0 (which is filtered out anyway). */
  ratio: number;
  level: BudgetLevel;
}

/** The budget/envelope overview across every budgeted category. */
export interface BudgetStatus {
  envelopes: BudgetEnvelope[];
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
}

export interface BudgetOptions {
  /** Ratio at/above which an envelope is a "warning" (but not yet over). */
  warnAt: number;
}

export const DEFAULT_BUDGET_OPTIONS: BudgetOptions = { warnAt: 0.8 };

/**
 * Compute per-category budget "envelopes" from the set budgets and actual spend (#103). Pure and
 * deterministic; the DB reads live in the loader. Only categories with a positive budget become
 * envelopes (an un-budgeted category is ignored, even if it has spend); spend defaults to 0.
 * `level` is `over` once spend exceeds budget, `warning` at/above `warnAt` of it, else `ok`.
 * Envelopes follow the canonical {@link TYPES} order for a stable display.
 */
export function computeBudgetStatus(
  budgets: Partial<Record<RealType, number>>,
  spentByType: Partial<Record<RealType, number>>,
  options: BudgetOptions = DEFAULT_BUDGET_OPTIONS,
): BudgetStatus {
  const envelopes: BudgetEnvelope[] = [];
  for (const type of TYPES) {
    const budget = budgets[type] ?? 0;
    if (budget <= 0) continue; // un-budgeted or non-positive → not an envelope
    const spent = spentByType[type] ?? 0;
    const ratio = spent / budget;
    const level: BudgetLevel = spent > budget ? "over" : ratio >= options.warnAt ? "warning" : "ok";
    envelopes.push({ type, budget, spent, remaining: budget - spent, ratio, level });
  }

  const totalBudget = envelopes.reduce((sum, e) => sum + e.budget, 0);
  const totalSpent = envelopes.reduce((sum, e) => sum + e.spent, 0);
  return { envelopes, totalBudget, totalSpent, totalRemaining: totalBudget - totalSpent };
}
