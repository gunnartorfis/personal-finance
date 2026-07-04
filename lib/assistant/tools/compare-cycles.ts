import { z } from "zod";

import { currentCycleKey, cycleKeyLabel, cycleKeyRange, previousCycleKey } from "@/lib/dashboard/cycle";
import type { NetSummary } from "@/lib/dashboard/net-summary";
import { buildTopMerchants } from "@/lib/dashboard/top-merchants";

import { cycleKeySchema, loadCycleSummary, magnitude, unclassifiedMagnitude } from "./cycle-input";
import type { AssistantTool, AssistantToolContext } from "./types";

const compareCyclesSchema = z.object({
  cycle: cycleKeySchema.optional(),
  baseline: cycleKeySchema.optional(),
});
type CompareCyclesInput = z.infer<typeof compareCyclesSchema>;

/** One merchant's spend change between the two cycles (risers only, biggest first). */
export interface MerchantRiser {
  merchant: string;
  cycleSpending: number;
  baselineSpending: number;
  delta: number;
}

/** Why one cycle differs from a baseline: totals, per-bucket deltas, and the merchants that rose. */
export interface CompareCyclesResult {
  cycle: { key: string; label: string; spending: number };
  baseline: { key: string; label: string; spending: number };
  /** cycle.spending − baseline.spending (positive = the cycle spent more). */
  spendingDelta: number;
  byTypeDelta: { Fixed: number; Necessary: number; "Nice to have": number };
  /**
   * Change in not-yet-bucketed card spend between the cycles. `topRisers` is built from merchant
   * spend, which excludes these rows, so this surfaces the residual that risers can't explain (the
   * rest of any gap is off-card fixed costs, visible in `byTypeDelta.Fixed`).
   */
  unclassifiedDelta: number;
  topRisers: MerchantRiser[];
}

const MAX_RISERS = 5;

function typeMagnitude(summary: NetSummary, type: "Fixed" | "Necessary" | "Nice to have"): number {
  return magnitude(summary.byExpenseType[type]);
}

/** Normalized-merchant → spend magnitude for a cycle (reuses the tested merchant normalization). */
async function merchantSpend(
  ctx: AssistantToolContext,
  cycle: string,
): Promise<Map<string, number>> {
  const rows = await ctx.repo.transactions.topMerchants(cycleKeyRange(cycle));
  return new Map(buildTopMerchants(rows, Number.POSITIVE_INFINITY).map((m) => [m.merchant, m.spending]));
}

/** `compareCycles` — the "why was March higher?" tool. */
export const compareCyclesTool: AssistantTool<CompareCyclesInput, CompareCyclesResult> = {
  name: "compareCycles",
  description:
    "Compare a statement cycle against a baseline cycle (both YYYY-MM; `cycle` omitted = current, " +
    "`baseline` omitted = the previous cycle) to explain a change: total spend delta, per-bucket " +
    "deltas, and the merchants whose spend rose the most.",
  inputSchema: compareCyclesSchema,
  async run(ctx, input) {
    const cycleKey = input.cycle ?? currentCycleKey(ctx.now);
    const baselineKey = input.baseline ?? previousCycleKey(cycleKey);

    const [cycleSummary, baselineSummary, cycleMerchants, baselineMerchants] = await Promise.all([
      loadCycleSummary(ctx, cycleKey),
      loadCycleSummary(ctx, baselineKey),
      merchantSpend(ctx, cycleKey),
      merchantSpend(ctx, baselineKey),
    ]);

    const cycleSpending = magnitude(cycleSummary.expense);
    const baselineSpending = magnitude(baselineSummary.expense);

    const topRisers = [...new Set([...cycleMerchants.keys(), ...baselineMerchants.keys()])]
      .map((merchant) => {
        const cs = cycleMerchants.get(merchant) ?? 0;
        const bs = baselineMerchants.get(merchant) ?? 0;
        return { merchant, cycleSpending: cs, baselineSpending: bs, delta: cs - bs };
      })
      .filter((r) => r.delta > 0)
      .sort((a, b) => b.delta - a.delta || (a.merchant < b.merchant ? -1 : a.merchant > b.merchant ? 1 : 0))
      .slice(0, MAX_RISERS);

    return {
      cycle: { key: cycleKey, label: cycleKeyLabel(cycleKey), spending: cycleSpending },
      baseline: { key: baselineKey, label: cycleKeyLabel(baselineKey), spending: baselineSpending },
      spendingDelta: cycleSpending - baselineSpending,
      byTypeDelta: {
        Fixed: typeMagnitude(cycleSummary, "Fixed") - typeMagnitude(baselineSummary, "Fixed"),
        Necessary: typeMagnitude(cycleSummary, "Necessary") - typeMagnitude(baselineSummary, "Necessary"),
        "Nice to have":
          typeMagnitude(cycleSummary, "Nice to have") - typeMagnitude(baselineSummary, "Nice to have"),
      },
      unclassifiedDelta: unclassifiedMagnitude(cycleSummary) - unclassifiedMagnitude(baselineSummary),
      topRisers,
    };
  },
};
