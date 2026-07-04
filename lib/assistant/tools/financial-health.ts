import { z } from "zod";

import { loadFinancialHealth } from "@/lib/dashboard/financial-health";
import { computeRunwayMonths, loadNetWorth } from "@/lib/dashboard/net-worth";

import type { AssistantTool } from "./types";

/** Long-run financial health + net worth + runway (ADR-0016). Averages are null with thin history. */
export interface FinancialHealthResult {
  completedCycles: number;
  hasEnoughHistory: boolean;
  avgMonthlySaving: number | null;
  avgMonthlyIncome: number | null;
  /** Fraction of income saved (0..1, may be negative); null with thin history. */
  savingsRate: number | null;
  /** Average monthly outflow (off-card fixed + card debits); null with thin history. */
  monthlyBurn: number | null;
  profitableCount: number;
  /** Sum of latest per-account balances; null until a balance is recorded. */
  netWorth: { total: number; accountCount: number } | null;
  /** Whole months net worth covers the burn; null when burn or net worth is unavailable. */
  runwayMonths: number | null;
}

/** `getFinancialHealth` — savings rate, monthly burn, net worth, and runway. */
export const financialHealthTool: AssistantTool<Record<string, never>, FinancialHealthResult> = {
  name: "getFinancialHealth",
  description:
    "Get the household's long-run financial health: average monthly saving and income, savings rate, " +
    "monthly burn, net worth (from recorded balances), and runway in months. Averages are null when " +
    "there is too little history.",
  inputSchema: z.object({}),
  async run(ctx) {
    const [health, netWorth] = await Promise.all([
      loadFinancialHealth(ctx.repo, ctx.now),
      loadNetWorth(ctx.repo),
    ]);
    return {
      completedCycles: health.completedCycles,
      hasEnoughHistory: health.hasEnoughHistory,
      avgMonthlySaving: health.avgMonthlySaving,
      avgMonthlyIncome: health.avgMonthlyIncome,
      savingsRate: health.savingsRate,
      monthlyBurn: health.monthlyBurn,
      profitableCount: health.profitableCount,
      netWorth: netWorth ? { total: netWorth.total, accountCount: netWorth.accountCount } : null,
      runwayMonths: netWorth ? computeRunwayMonths(netWorth.total, health.monthlyBurn) : null,
    };
  },
};
