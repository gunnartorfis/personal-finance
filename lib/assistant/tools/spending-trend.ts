import { z } from "zod";

import { loadMonthlySpendSeries, type MonthlySpendPoint } from "@/lib/dashboard/monthly-series";
import { computeSpendingTrendStats } from "@/lib/dashboard/spending-trend";

import type { AssistantTool } from "./types";

const spendingTrendSchema = z.object({ months: z.number().int().min(2).max(24).optional() });
type SpendingTrendInput = z.infer<typeof spendingTrendSchema>;

/** A multi-cycle spend/income series plus derived trend stats. */
export interface SpendingTrendResult {
  /** Oldest → newest; each point is one statement cycle (excluded rows already dropped). */
  series: MonthlySpendPoint[];
  stats: {
    completedMonths: number;
    hasEnoughHistory: boolean;
    /** Average spend over the trailing completed cycles, or null with too little history. */
    trailingAverage: number | null;
    /** Last completed cycle's spend vs the trailing average, as a fraction; null if N/A. */
    vsAveragePct: number | null;
    /** End-of-month projection for the in-progress cycle from spend-so-far; null if N/A. */
    projectedThisMonth: number | null;
  };
}

/** `getSpendingTrend` — is spending trending up? Returns the series + trailing-average context. */
export const spendingTrendTool: AssistantTool<SpendingTrendInput, SpendingTrendResult> = {
  name: "getSpendingTrend",
  description:
    "Get the monthly spending/income series over the last `months` statement cycles (2..24, default " +
    "6, oldest first) plus trend stats: trailing average, the latest completed cycle vs that average, " +
    "and this month's projected spend.",
  inputSchema: spendingTrendSchema,
  async run(ctx, input) {
    const series = await loadMonthlySpendSeries(ctx.repo, ctx.now, input.months ?? 6);
    const stats = computeSpendingTrendStats(series, ctx.now);
    return {
      series,
      stats: {
        completedMonths: stats.completedMonths,
        hasEnoughHistory: stats.hasEnoughHistory,
        trailingAverage: stats.trailingAverage,
        vsAveragePct: stats.vsAveragePct,
        projectedThisMonth: stats.projection?.projected ?? null,
      },
    };
  },
};
