import { cycleKeyLabel } from "@/lib/dashboard/cycle";

import {
  loadCycleSummary,
  magnitude,
  optionalCycleSchema,
  resolveCycleKey,
  type OptionalCycleInput,
} from "./cycle-input";
import type { AssistantTool } from "./types";

/** Headline figures for one statement cycle. Amounts are in the household's billing currency. */
export interface CycleSummaryResult {
  cycle: string;
  label: string;
  /** Total spend as a positive magnitude (Spending; ADR-0008). */
  spending: number;
  /** Marked income only — unmarked credits count for nothing (ADR-0009). */
  income: number;
  /** Income − Spending (the dashboard's Difference; may be negative). */
  difference: number;
}

/** `getCycleSummary` — the top-line Spending / Income / Difference for a cycle. */
export const cycleSummaryTool: AssistantTool<OptionalCycleInput, CycleSummaryResult> = {
  name: "getCycleSummary",
  description:
    "Get total spending, marked income, and their difference for one statement cycle (YYYY-MM; " +
    "omit to use the current cycle). Amounts are in the household's billing currency; spending is a " +
    "positive number, difference is income minus spending.",
  inputSchema: optionalCycleSchema,
  async run(ctx, input) {
    const cycle = resolveCycleKey(ctx, input.cycle);
    const summary = await loadCycleSummary(ctx, cycle);
    return {
      cycle,
      label: cycleKeyLabel(cycle),
      spending: magnitude(summary.expense),
      income: summary.income,
      difference: summary.net,
    };
  },
};
