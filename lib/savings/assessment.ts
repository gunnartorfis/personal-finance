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
import { resolveCycleAmounts, timelinesByName } from "@/shared/income-timeline";
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
 * `Monthly income − Off-card fixed − card debits`. Income/off-card are resolved PER CYCLE from the
 * effective-dated source timelines plus any one-off adjustments on that cycle (ADR-0015) — no longer
 * one flat figure applied to all cycles — while card debits are read straight from the cycle's
 * transactions. There is still no frozen history: config edits (including correcting a past cycle's
 * income) re-flow through every cycle. Only COMPLETED cycles count toward cumulative saved; the
 * current (in-progress) cycle is excluded until its month closes (ADR-0021) — it is shown in the
 * breakdown as the cycle being budgeted, not yet counted.
 */

/** One cycle's derived saving — the Savings page's per-cycle breakdown table. */
export interface SavingsCycle {
  cycleKey: string;
  monthlyIncome: number;
  offCardFixed: number;
  /** Card debit magnitude for the cycle (positive), from the transactions. */
  cardDebits: number;
  inferredSaving: number;
  /**
   * True only for the current, still-open calendar month (ADR-0021). Its `inferredSaving` is shown
   * in the breakdown but NOT folded into cumulative saved — mid-month it carries full income against
   * near-zero spend and would overstate savings. It is the cycle being budgeted, not yet counted.
   */
  inProgress: boolean;
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
   * True when an in-progress current cycle is present (goal's start cycle reached). It is shown in
   * the breakdown but excluded from cumulative saved (ADR-0021); the panel uses it to tell the user
   * this month is not yet in the total — it counts once the calendar month closes.
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
 * Derive each elapsed cycle's saving from the effective-dated config + spend (ADR-0015). Reads the
 * income sources, off-card costs, one-off adjustments, and the per-cycle card-debit series in one
 * pass (the series is a single grouped query over the whole `[start, current]` range), resolves the
 * in-force income/cost per cycle, then computes `inferredSaving` per cycle. `cycles` is empty before
 * the start cycle; the returned `monthlyIncome`/`offCardFixed` are the CURRENT cycle's resolved
 * amounts (the coming cycle's budget anchor) so the assessment can reason about the goal even then.
 */
async function deriveCycles(
  repo: HouseholdRepo,
  goal: Goal,
  now: Date,
): Promise<{ cycles: SavingsCycle[]; monthlyIncome: number; offCardFixed: number }> {
  const cycleKey = currentCycleKey(now);
  const keys = cycleKeysInclusive(goal.startCycle, cycleKey);

  const [sources, costs, oneOffs, series] = await Promise.all([
    repo.savings.incomeSources.list(),
    repo.savings.offcardCosts.list(),
    repo.savings.oneOffAdjustments.list(),
    keys.length === 0
      ? Promise.resolve([])
      : repo.transactions.monthlySpendSeries({
          from: cycleKeyRange(goal.startCycle).from,
          to: cycleKeyRange(cycleKey).to,
        }),
  ]);

  // Resolve each cycle's effective income/cost from the dated source timelines + one-off
  // adjustments (ADR-0015), replacing the old single flat sum applied to every cycle. Always
  // resolve the current cycle too — it anchors the coming cycle's Allowed nice-to-have even when
  // the goal's range is empty (start cycle in the future).
  const resolveKeys = keys.length === 0 ? [cycleKey] : keys;
  const resolved = resolveCycleAmounts(
    {
      incomeSources: timelinesByName(sources, (s) => s.amount),
      offcardCostSources: timelinesByName(costs, (c) => c.monthlyAmount),
      incomeOneOffs: oneOffs
        .filter((o) => o.kind === "income")
        .map((o) => ({ cycleKey: o.cycleKey, amount: o.amount })),
      costOneOffs: oneOffs
        .filter((o) => o.kind === "cost")
        .map((o) => ({ cycleKey: o.cycleKey, amount: o.amount })),
    },
    resolveKeys,
  );

  // `spending` is the debit magnitude with excluded rows dropped (ADR-0011) — exactly ADR-0007's
  // debits-only card spend. Months with no rows are absent, so default to 0.
  const debitsByCycle = new Map(series.map((row) => [row.month, row.spending]));

  const cycles = keys.map((key) => {
    const { monthlyIncome, offCardFixed } = resolved.get(key)!;
    const cardDebits = debitsByCycle.get(key) ?? 0;
    return {
      cycleKey: key,
      monthlyIncome,
      offCardFixed,
      cardDebits,
      inferredSaving: inferredSaving({ monthlyIncome, offCardFixed, cardDebits }),
      inProgress: key === cycleKey,
    };
  });

  // The coming/budgeted cycle is the current in-progress one (ADR-0021); its resolved amounts drive
  // Allowed nice-to-have, so return them rather than a flat all-sources sum. `cycleKey` is always in
  // `resolveKeys` (it is the last of `keys`, or the sole key when the range is empty), so the lookup
  // never misses.
  const current = resolved.get(cycleKey)!;
  return { cycles, monthlyIncome: current.monthlyIncome, offCardFixed: current.offCardFixed };
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
  return buildSavingsProgress(goal, completedSavings(cycles));
}

/** Each completed cycle's saving — the current in-progress cycle is excluded (ADR-0021). */
function completedSavings(cycles: ReadonlyArray<SavingsCycle>): number[] {
  return cycles.filter((c) => !c.inProgress).map((c) => c.inferredSaving);
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

  const progress = buildSavingsProgress(goal, completedSavings(cycles))!;
  const cycleKey = currentCycleKey(now);
  // Only completed cycles count toward saved and the on-track baseline (ADR-0021); the current
  // in-progress cycle (if any) is the one being budgeted, not yet elapsed.
  const cyclesElapsed = cycles.filter((c) => !c.inProgress).length;

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
      // True when an in-progress current cycle is on screen but not yet in the total (ADR-0021).
      provisional: cycles.some((c) => c.inProgress),
    },
  };
}
