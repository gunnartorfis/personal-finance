import { z } from "zod";

import { loadSavingsSnapshot } from "@/lib/savings/assessment";

import type { AssistantTool } from "./types";

/**
 * Savings-goal status. `hasGoal` is false (and every other field absent) when the Household has no
 * active goal; otherwise the progress + this-cycle pace figures (ADR-0007/0021/0015).
 */
export interface SavingsStatusResult {
  hasGoal: boolean;
  target?: number;
  /** Inferred saving to date across completed cycles. */
  saved?: number;
  /** saved / target, 0..1 (may exceed 1 if over-saved). */
  percent?: number;
  currency?: string;
  /** Cumulative Inferred saving ≥ cumulative Required saving through the last completed cycle. */
  onTrack?: boolean;
  /** Per-cycle amount needed to stay on pace next cycle. */
  requiredSaving?: number;
  /** Discretionary budget for the coming cycle that still hits the goal. */
  allowedNiceToHave?: number;
  cyclesRemaining?: number;
}

/** `getSavingsStatus` — goal progress and whether the Household is on track. */
export const savingsStatusTool: AssistantTool<Record<string, never>, SavingsStatusResult> = {
  name: "getSavingsStatus",
  description:
    "Get the household's savings-goal status: target, saved so far, percent, whether it's on track, " +
    "the required saving to stay on pace, and the allowed nice-to-have budget for the coming cycle. " +
    "Returns { hasGoal: false } when no goal is set.",
  inputSchema: z.object({}),
  async run(ctx) {
    const snapshot = await loadSavingsSnapshot(ctx.repo, ctx.now);
    if (!snapshot) return { hasGoal: false };
    const { progress, assessment } = snapshot;
    return {
      hasGoal: true,
      target: progress.target,
      saved: progress.saved,
      percent: progress.percent,
      currency: progress.currency,
      onTrack: assessment.onTrack,
      requiredSaving: assessment.requiredSaving,
      allowedNiceToHave: assessment.allowedNiceToHave,
      cyclesRemaining: assessment.cyclesRemaining,
    };
  },
};
