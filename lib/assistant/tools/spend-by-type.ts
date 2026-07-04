import {
  loadCycleSummary,
  magnitude,
  optionalCycleSchema,
  resolveCycleKey,
  unclassifiedMagnitude,
  type OptionalCycleInput,
} from "./cycle-input";
import type { AssistantTool } from "./types";

/** A cycle's spend split across the real expense-type buckets, as positive magnitudes. */
export interface SpendByTypeResult {
  cycle: string;
  byType: { Fixed: number; Necessary: number; "Nice to have": number };
  /** Debits with no bucket yet (pending/`""` type) — kept separate so buckets never over-claim. */
  unclassified: number;
  totalSpending: number;
}

/** `spendByType` — how a cycle's spend divides across Fixed / Necessary / Nice to have. */
export const spendByTypeTool: AssistantTool<OptionalCycleInput, SpendByTypeResult> = {
  name: "spendByType",
  description:
    "Break one statement cycle's spending into the Fixed, Necessary, and Nice to have buckets " +
    "(YYYY-MM; omit for the current cycle). Values are positive magnitudes; `unclassified` holds " +
    "debits not yet bucketed.",
  inputSchema: optionalCycleSchema,
  async run(ctx, input) {
    const cycle = resolveCycleKey(ctx, input.cycle);
    const summary = await loadCycleSummary(ctx, cycle);
    return {
      cycle,
      byType: {
        // Fixed folds in configured Off-card fixed costs (ADR-0015), matching the Transactions view.
        Fixed: magnitude(summary.byExpenseType.Fixed),
        Necessary: magnitude(summary.byExpenseType.Necessary),
        "Nice to have": magnitude(summary.byExpenseType["Nice to have"]),
      },
      // The explicit "" bucket (not-bucketed) and rows with no effective type are both "not
      // categorized" to a reader, so surface them together.
      unclassified: unclassifiedMagnitude(summary),
      totalSpending: magnitude(summary.expense),
    };
  },
};
