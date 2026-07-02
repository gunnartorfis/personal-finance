import {
  currentCycleKey,
  cycleKeyRange,
  cyclesBetweenInclusive,
  isValidCycleKey,
  nextCycleKey,
} from "@/lib/dashboard/cycle";
import type { HouseholdRepo } from "@/lib/db/household-repo";
import { buildSavingsProgress, type SavingsProgress } from "@/lib/savings/progress";
import { loadExpectedSpend } from "@/lib/savings/expected-spend";
import {
  allowedNiceToHave,
  correctivePerCycle,
  inferredSaving,
  isOnTrack,
  requiredCumulativeByCycle,
} from "@/shared/savings";

/**
 * Savings progress is now DERIVED, not checked-in (ADR-0007, superseding the manual ritual): for
 * every Statement cycle from the goal's start cycle through the current one, saving is
 * `Monthly income − Off-card fixed − card debits`, with income/off-card read from the current
 * config and card debits read straight from the cycle's transactions. There is no frozen history —
 * config edits re-flow through every cycle. The current (in-progress) cycle is partial, so its
 * derived saving is provisional until the month completes.
 */

/** One cycle's derived saving — the Savings page's per-cycle breakdown table. */
export interface SavingsCycle {
  cycleKey: string;
  monthlyIncome: number;
  offCardFixed: number;
  /** Card debit magnitude for the cycle (positive), from the transactions. */
  cardDebits: number;
  inferredSaving: number;
}

/** The goal assessment the Savings page renders — mirrors the old check-in assessment, sans freeze. */
export interface SavingsAssessment {
  cycleKey: string;
  /** Saved to date: startingSaved + every elapsed cycle's inferred saving. */
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
   * True whenever the current (in-progress) cycle is counted — i.e. from the goal's start cycle
   * onward. Deliberate and effectively always-on for an active goal: unlike the old check-in
   * (which froze a completed cycle and only flagged unclassified rows), progress here always
   * includes the current month, whose spend keeps changing until the cycle closes. The panel uses
   * it to tell the user the latest cycle's numbers are not yet final.
   */
  provisional: boolean;
}

/** Everything the Savings page needs; the dashboard uses only `progress` (see {@link loadSavingsProgress}). */
export interface SavingsSnapshot {
  progress: SavingsProgress;
  assessment: SavingsAssessment;
  /** Per-cycle breakdown, oldest cycle first. */
  cycles: SavingsCycle[];
}

type Goal = NonNullable<Awaited<ReturnType<HouseholdRepo["savings"]["goal"]["get"]>>>;

/** The cycle keys from `startCycle` through `endCycle` inclusive; empty when `endCycle` precedes it. */
function cycleKeysInclusive(startCycle: string, endCycle: string): string[] {
  const count = cyclesBetweenInclusive(startCycle, endCycle);
  if (count < 1) return [];
  const keys: string[] = [];
  let key = startCycle;
  for (let i = 0; i < count; i++) {
    keys.push(key);
    key = nextCycleKey(key);
  }
  return keys;
}

/**
 * Derive each elapsed cycle's saving from the current config + spend. Reads the income sources,
 * off-card costs, and the per-cycle card-debit series in one pass (the series is a single grouped
 * query over the whole `[start, current]` range), then computes `inferredSaving` per cycle.
 * `cycles` is empty before the start cycle; `monthlyIncome`/`offCardFixed` still reflect the config
 * so the assessment can reason about the goal even then.
 */
async function deriveCycles(
  repo: HouseholdRepo,
  goal: Goal,
  now: Date,
): Promise<{ cycles: SavingsCycle[]; monthlyIncome: number; offCardFixed: number }> {
  const cycleKey = currentCycleKey(now);
  const keys = cycleKeysInclusive(goal.startCycle, cycleKey);

  const [sources, costs, series] = await Promise.all([
    repo.savings.incomeSources.list(),
    repo.savings.offcardCosts.list(),
    keys.length === 0
      ? Promise.resolve([])
      : repo.transactions.monthlySpendSeries({
          from: cycleKeyRange(goal.startCycle).from,
          to: cycleKeyRange(cycleKey).to,
        }),
  ]);

  const monthlyIncome = sources.reduce((total, s) => total + s.amount, 0);
  const offCardFixed = costs.reduce((total, c) => total + c.monthlyAmount, 0);
  // `spending` is the debit magnitude with excluded rows dropped (ADR-0011) — exactly ADR-0007's
  // debits-only card spend. Months with no rows are absent, so default to 0.
  const debitsByCycle = new Map(series.map((row) => [row.month, row.spending]));

  const cycles = keys.map((key) => {
    const cardDebits = debitsByCycle.get(key) ?? 0;
    return {
      cycleKey: key,
      monthlyIncome,
      offCardFixed,
      cardDebits,
      inferredSaving: inferredSaving({ monthlyIncome, offCardFixed, cardDebits }),
    };
  });
  return { cycles, monthlyIncome, offCardFixed };
}

/**
 * The dashboard's Savings progress card numbers (or `null` when no goal is set). Lean: derives the
 * cycles and folds them, without the coming-cycle assessment the Savings page needs.
 */
export async function loadSavingsProgress(
  repo: HouseholdRepo,
  now: Date,
): Promise<SavingsProgress | null> {
  const goal = await repo.savings.goal.get();
  if (!goal) return null;
  const { cycles } = await deriveCycles(repo, goal, now);
  return buildSavingsProgress(goal, cycles.map((c) => c.inferredSaving));
}

/**
 * The full Savings snapshot for the Savings page: progress, per-cycle breakdown, and the coming
 * cycle's assessment (on-track vs the linear baseline, corrective pace, Allowed nice-to-have from
 * the trailing-average estimator). `null` when no goal is set.
 */
export async function loadSavingsSnapshot(
  repo: HouseholdRepo,
  now: Date,
): Promise<SavingsSnapshot | null> {
  const goal = await repo.savings.goal.get();
  if (!goal) return null;

  const [{ cycles, monthlyIncome, offCardFixed }, expected] = await Promise.all([
    deriveCycles(repo, goal, now),
    loadExpectedSpend(repo, now),
  ]);

  const progress = buildSavingsProgress(goal, cycles.map((c) => c.inferredSaving))!;
  const cycleKey = currentCycleKey(now);
  const cyclesElapsed = Math.max(0, cyclesBetweenInclusive(goal.startCycle, cycleKey));

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
  const requiredSaving = correctivePerCycle(savingsGoal, progress.saved, cyclesRemaining);

  return {
    progress,
    cycles,
    assessment: {
      cycleKey,
      cumulative: progress.saved,
      requiredCumulative: requiredCumulativeByCycle(savingsGoal, cyclesElapsed),
      onTrack: isOnTrack(savingsGoal, cyclesElapsed, progress.saved),
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
      // The current cycle is always the last derived one and is still in progress.
      provisional: cyclesElapsed >= 1,
    },
  };
}
