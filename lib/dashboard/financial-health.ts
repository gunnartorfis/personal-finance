import type { HouseholdRepo } from "@/lib/db/household-repo";
import { resolveCycleAmounts, timelinesByName } from "@/shared/income-timeline";
import { inferredSaving } from "@/shared/savings";

import type { CycleKey } from "./cycle";
import { cycleKeyRange, currentCycleKey, recentCycleKeys } from "./cycle";

/**
 * Household "financial health" metrics — the dashboard's answer to *are we turning a profit*, *how
 * much can we realistically save each month*, and (with a balance, later slices) *will we survive
 * long-term* (ADR-0016). All amounts are in the Household's billing currency (ADR-0004).
 *
 * The fold is pure so it unit-tests directly, mirroring {@link import("./net-summary")} and
 * `shared/savings`; the database reads live in {@link loadFinancialHealth}. It works off COMPLETED
 * Statement cycles only — the in-progress current month is excluded (ADR-0014), since mid-month it
 * carries full configured income against near-zero spend and would flatter every number here.
 *
 * "Realistic recent" numbers (typical monthly saving, savings rate, burn) are trailing averages over
 * the last {@link HealthOptions.avgWindow} completed cycles, so a single lucky or unlucky month never
 * defines them; the profit streak looks back over the last {@link HealthOptions.streakWindow} cycles
 * so it reads as "profitable N of the last M".
 */

/** One completed cycle's resolved money-flow — the input to {@link computeFinancialHealth}. */
export interface HealthCycle {
  cycleKey: CycleKey;
  /** Configured income in force that cycle plus its one-off income adjustments (>= 0, ADR-0015). */
  monthlyIncome: number;
  /** Off-card fixed costs in force that cycle plus its one-off cost adjustments (>= 0, ADR-0015). */
  offCardFixed: number;
  /** Card debit magnitude for the cycle (>= 0), from the transactions. */
  cardDebits: number;
}

export interface FinancialHealth {
  /** Completed cycles with activity that fed the fold (leading empty cycles excluded upstream). */
  completedCycles: number;
  /** Whether there are at least `minCycles` completed cycles — gates the trailing-average numbers. */
  hasEnoughHistory: boolean;
  /**
   * Typical monthly saving: the trailing-window average of `monthlyIncome − offCardFixed − cardDebits`
   * per cycle. This is both the "are we profiting" figure (positive = profit) and the "how much do we
   * save" figure — off-card + card debits together cover the Household's outflow. Null without history.
   */
  avgMonthlySaving: number | null;
  /** Trailing-window average configured income — the savings-rate denominator. Null without history. */
  avgMonthlyIncome: number | null;
  /**
   * Savings rate as a 0..1 fraction of gross income (`avgMonthlySaving / avgMonthlyIncome`); may be
   * negative in a losing stretch. Null without history or when average income is 0 (can't divide).
   */
  savingsRate: number | null;
  /**
   * Trailing-window average outflow (`offCardFixed + cardDebits`) — what the Household burns each
   * month, i.e. the drain if income stopped. Feeds runway once a balance exists. Null without history.
   */
  monthlyBurn: number | null;
  /** How many of the last `streakConsidered` completed cycles were profitable (saving > 0). */
  profitableCount: number;
  /** The streak window actually available: `min(streakWindow, completedCycles)`. */
  streakConsidered: number;
}

export interface HealthOptions {
  /** Minimum completed cycles before the trailing averages are trustworthy (default 3). */
  minCycles?: number;
  /** How many trailing cycles the averages (saving, income, burn) span (default 3). */
  avgWindow?: number;
  /** How many trailing cycles the profit streak reads over (default 6). */
  streakWindow?: number;
}

/** Defaults mirroring the dashboard trend gate: ≥3 completed cycles; 3-cycle averages; 6-cycle streak. */
export const DEFAULT_HEALTH: Required<HealthOptions> = {
  minCycles: 3,
  avgWindow: 3,
  streakWindow: 6,
};

/** Saving for one cycle: `monthlyIncome − offCardFixed − cardDebits` (reuses `shared/savings`). */
function cycleSaving(cycle: HealthCycle): number {
  return inferredSaving(cycle);
}

/** Rounded mean of `values`; 0 for an empty list (callers gate on history before using it). */
function roundedMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * Fold completed cycles into {@link FinancialHealth}. Pure and side-effect free. `cycles` should be
 * the completed cycles (any order — sorted here defensively); the reads and cycle resolution live in
 * {@link loadFinancialHealth}.
 */
export function computeFinancialHealth(
  cycles: ReadonlyArray<HealthCycle>,
  options: HealthOptions = {},
): FinancialHealth {
  const { minCycles, avgWindow, streakWindow } = { ...DEFAULT_HEALTH, ...options };

  // Month keys sort lexicographically the same as chronologically, so a plain string compare orders
  // them oldest-first regardless of the caller's order.
  const ordered = [...cycles].sort((a, b) => a.cycleKey.localeCompare(b.cycleKey));
  const completedCycles = ordered.length;
  const hasEnoughHistory = completedCycles >= minCycles;

  const avgCycles = ordered.slice(-avgWindow);
  const avgMonthlySaving = hasEnoughHistory ? roundedMean(avgCycles.map(cycleSaving)) : null;
  const avgMonthlyIncome = hasEnoughHistory
    ? roundedMean(avgCycles.map((c) => c.monthlyIncome))
    : null;
  const monthlyBurn = hasEnoughHistory
    ? roundedMean(avgCycles.map((c) => c.offCardFixed + c.cardDebits))
    : null;
  const savingsRate =
    avgMonthlySaving !== null && avgMonthlyIncome !== null && avgMonthlyIncome > 0
      ? avgMonthlySaving / avgMonthlyIncome
      : null;

  const streakCycles = ordered.slice(-streakWindow);
  const profitableCount = streakCycles.filter((c) => cycleSaving(c) > 0).length;

  return {
    completedCycles,
    hasEnoughHistory,
    avgMonthlySaving,
    avgMonthlyIncome,
    savingsRate,
    monthlyBurn,
    profitableCount,
    streakConsidered: streakCycles.length,
  };
}

/**
 * Load the Household's financial-health metrics over the `count` most recent COMPLETED cycles ending
 * before the month containing `now` (default 12; the in-progress current month is always excluded,
 * ADR-0014, so the look-back asks for one extra cycle). Resolves each cycle's effective income /
 * off-card cost from the dated source timelines plus one-off adjustments (ADR-0015) — the same
 * resolution the Savings math uses — and reads card debits from the per-cycle spend series in one
 * grouped query. Leading cycles with no income and no spend (before the Household's history begins)
 * are dropped so they don't drag the averages toward zero.
 */
export async function loadFinancialHealth(
  repo: HouseholdRepo,
  now: Date,
  count = 12,
): Promise<FinancialHealth> {
  const currentKey = currentCycleKey(now);
  // `count` is the number of COMPLETED cycles to consider. `recentCycleKeys` counts from the current
  // (in-progress) month, so ask for one extra and drop the current month — leaving up to `count`
  // completed cycles (fewer only when the Household's history is shorter), never `count − 1`.
  const completedKeys = recentCycleKeys(now, count + 1).filter((key) => key < currentKey);
  if (completedKeys.length === 0) return computeFinancialHealth([]);

  const range = {
    from: cycleKeyRange(completedKeys[0]).from,
    to: cycleKeyRange(completedKeys[completedKeys.length - 1]).to,
  };
  const [series, sources, costs, oneOffs] = await Promise.all([
    repo.transactions.monthlySpendSeries(range),
    repo.savings.incomeSources.list(),
    repo.savings.offcardCosts.list(),
    repo.savings.oneOffAdjustments.list(),
  ]);

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
    completedKeys,
  );

  const debitsByCycle = new Map(series.map((row) => [row.month, row.spending]));
  const resolvedCycles = completedKeys.map((key) => {
    const { monthlyIncome, offCardFixed } = resolved.get(key)!;
    return { cycleKey: key, monthlyIncome, offCardFixed, cardDebits: debitsByCycle.get(key) ?? 0 };
  });

  // Trim only the LEADING cycles from before the Household's history began — those with no income
  // configured and no spend recorded, gap-filled to zero, which would otherwise fake up history and
  // drag the averages down. A drop-while, not a blanket filter: once history has started, a later
  // cycle with zero income but real off-card costs (e.g. a spell between jobs) is a genuine LOSING
  // cycle and must stay in, or the averages would flatter a period of income disruption.
  const firstActive = resolvedCycles.findIndex((c) => c.cardDebits > 0 || c.monthlyIncome > 0);
  const cycles = firstActive === -1 ? [] : resolvedCycles.slice(firstActive);

  return computeFinancialHealth(cycles);
}
