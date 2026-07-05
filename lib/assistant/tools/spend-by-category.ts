import { cycleKeyRange } from "@/lib/dashboard/cycle";
import { loadCategoryBreakdown } from "@/lib/dashboard/category-breakdown";

import { magnitude, optionalCycleSchema, resolveCycleKey, type OptionalCycleInput } from "./cycle-input";
import type { AssistantTool } from "./types";

/** A cycle's spend split across semantic Categories (ADR-0020), keyed by slug, positive magnitudes. */
export interface SpendByCategoryResult {
  cycle: string;
  /** Spend magnitude per Category slug (e.g. `groceries`, `fuel`); only categories with spend appear. */
  byCategory: Record<string, number>;
  /** Debits with no Category (Uncategorized) — kept separate so categories never over-claim. */
  uncategorized: number;
  /**
   * Total card spend for the cycle (positive magnitude). Transaction-based: unlike `spendByType`
   * this does NOT fold in configured off-card fixed costs, which aren't transactions and carry no
   * Category.
   */
  totalSpending: number;
}

/** `spendByCategory` — how a cycle's spend divides across the semantic Category axis. */
export const spendByCategoryTool: AssistantTool<OptionalCycleInput, SpendByCategoryResult> = {
  name: "spendByCategory",
  description:
    "Break one statement cycle's spending into semantic categories — what was bought, e.g. " +
    "groceries or fuel (YYYY-MM; omit for the current cycle). Values are positive magnitudes keyed " +
    "by category slug; `uncategorized` holds debits with no category. Orthogonal to spendByType " +
    "(which splits by Fixed/Necessary/Nice to have).",
  inputSchema: optionalCycleSchema,
  async run(ctx, input) {
    const cycle = resolveCycleKey(ctx, input.cycle);
    const [breakdown, rows] = await Promise.all([
      loadCategoryBreakdown(ctx.repo, cycleKeyRange(cycle)),
      ctx.repo.categories.list(),
    ]);
    const slugById = new Map(rows.map((r) => [r.id, r.slug]));

    const byCategory: Record<string, number> = {};
    for (const [categoryId, amount] of Object.entries(breakdown.byCategory)) {
      // Fall back to the id if a row is somehow missing (shouldn't happen — the FK guarantees it).
      byCategory[slugById.get(categoryId) ?? categoryId] = magnitude(amount);
    }

    return {
      cycle,
      byCategory,
      uncategorized: magnitude(breakdown.uncategorized),
      totalSpending: magnitude(breakdown.expense),
    };
  },
};
