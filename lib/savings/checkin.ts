import {
  currentCycleKey,
  cycleKeyRange,
  cyclesBetweenInclusive,
  isValidCycleKey,
} from "@/lib/dashboard/cycle";
import { loadNetSummary } from "@/lib/dashboard/net-summary";
import type { HouseholdRepo } from "@/lib/db/household-repo";
import type { savingsCheckins } from "@/lib/db/schema";
import { loadExpectedSpend } from "@/lib/savings/expected-spend";
import {
  allowedNiceToHave,
  correctivePerCycle,
  inferredSaving,
  isOnTrack,
  requiredCumulativeByCycle,
} from "@/shared/savings";

/** The goal assessment computed at check-in (ADR-0007) — what the Savings page renders. */
export interface CheckinAssessment {
  cycleKey: string;
  /** Saved to date: startingSaved + every frozen cycle's inferred saving (this one included). */
  cumulative: number;
  /** The fixed linear baseline for the elapsed cycles (exact, unrounded). */
  requiredCumulative: number;
  onTrack: boolean;
  cyclesElapsed: number;
  cyclesRemaining: number;
  /** Corrective pace for the coming cycle — rises when behind, 0 once the target is met. */
  requiredSaving: number;
  expectedFixed: number;
  expectedNecessary: number;
  expectedSource: "history" | "manual" | "none";
  allowedNiceToHave: number;
  /**
   * True when the frozen cycle still has unclassified expenses (pending/failed rows) — the
   * Nice-to-have breakdown may shift once they classify, so the UI flags it as provisional.
   */
  provisional: boolean;
}

export type CheckinResult =
  | {
      ok: true;
      checkin: typeof savingsCheckins.$inferSelect;
      assessment: CheckinAssessment;
    }
  | { ok: false; error: "no-goal" | "before-start-cycle" };

/**
 * Freeze the current Statement cycle's Check-in (ADR-0007): income + off-card costs come from
 * the Savings config, card debits from the cycle's net summary (debits only — `-expense`), and
 * the frozen row upserts by cycle so re-checking updates in place. Returns the frozen row plus
 * the goal assessment (on-track vs the linear baseline, corrective pace, Allowed nice-to-have
 * from the trailing-average estimator).
 */
export async function performCheckin(
  repo: HouseholdRepo,
  now: Date,
  cycleExtra: number,
): Promise<CheckinResult> {
  const goal = await repo.savings.goal.get();
  if (!goal) return { ok: false, error: "no-goal" };

  const cycleKey = currentCycleKey(now);
  const cyclesElapsed = cyclesBetweenInclusive(goal.startCycle, cycleKey);
  if (cyclesElapsed < 1) return { ok: false, error: "before-start-cycle" };

  const [sources, costs, summary, expected] = await Promise.all([
    repo.savings.incomeSources.list(),
    repo.savings.offcardCosts.list(),
    loadNetSummary(repo, cycleKeyRange(cycleKey)),
    loadExpectedSpend(repo, now),
  ]);

  const monthlyIncome = sources.reduce((total, s) => total + s.amount, 0);
  const offCardFixed = costs.reduce((total, c) => total + c.monthlyAmount, 0);
  // NetSummary.expense is the signed sum of all card debits (credits are excluded there), so its
  // magnitude is exactly ADR-0007's debits-only card spend.
  const cardDebits = -summary.expense;
  const saving = inferredSaving({ monthlyIncome, offCardFixed, cardDebits }) + cycleExtra;

  const [checkin] = await repo.savings.checkins.upsertByCycle({
    cycleKey,
    monthlyIncome,
    cycleExtra,
    offCardFixed,
    cardDebits,
    inferredSaving: saving,
  });
  if (!checkin) throw new Error("check-in upsert returned no rows");

  // Cumulative reads the frozen history back (this cycle's row included); rows from before the
  // goal's start cycle (e.g. an earlier goal's history) don't count toward this goal.
  const checkins = await repo.savings.checkins.list();
  const counted = checkins.filter((c) => c.cycleKey >= goal.startCycle);
  const cumulative =
    goal.startingSaved + counted.reduce((total, c) => total + c.inferredSaving, 0);

  // The date column maps to a YYYY-MM-DD string; guard the derived month key so a driver/mapping
  // change fails loudly here instead of silently skewing totalCycles.
  const targetMonth = goal.targetDate.slice(0, 7);
  if (!isValidCycleKey(targetMonth)) {
    throw new Error(`targetDate did not yield a cycle key: ${goal.targetDate}`);
  }
  const savingsGoal = {
    target: goal.target,
    startingSaved: goal.startingSaved,
    totalCycles: cyclesBetweenInclusive(goal.startCycle, targetMonth),
  };
  const cyclesRemaining = savingsGoal.totalCycles - cyclesElapsed;
  const requiredSaving = correctivePerCycle(savingsGoal, cumulative, cyclesRemaining);

  return {
    ok: true,
    checkin,
    assessment: {
      cycleKey,
      cumulative,
      requiredCumulative: requiredCumulativeByCycle(savingsGoal, cyclesElapsed),
      onTrack: isOnTrack(savingsGoal, cyclesElapsed, cumulative),
      cyclesElapsed,
      cyclesRemaining,
      requiredSaving,
      expectedFixed: expected.expectedFixed,
      expectedNecessary: expected.expectedNecessary,
      expectedSource: expected.source,
      allowedNiceToHave: allowedNiceToHave({
        monthlyIncome,
        offCardFixed,
        requiredSaving,
        expectedFixed: expected.expectedFixed,
        expectedNecessary: expected.expectedNecessary,
      }),
      provisional: summary.unclassified !== 0,
    },
  };
}
