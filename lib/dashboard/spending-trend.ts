import type { CycleKey } from "./cycle";
import { currentCycleKey } from "./cycle";
import type { MonthlySpendPoint } from "./monthly-series";

/**
 * Spending-trend statistics derived from a monthly series (Phase K, ADR-0008). Pure and
 * side-effect free — it consumes the series from {@link loadMonthlySpendSeries} plus `now`.
 *
 * Two honest, separate reads (per the dashboard design):
 * - a **completed-months** comparison (`trailingAverage` + `vsAveragePct` on the last completed
 *   month), so a partial current month never distorts the "vs your average" signal; and
 * - a **projection** for the in-progress current month (linear run-rate), shown as an estimate.
 *
 * "Completed months with data" (spending > 0) drive both the history gate and the average, so a
 * new Household's gap-filled leading zero months don't fake up history or drag the average down.
 */
export interface MonthProjection {
  month: CycleKey;
  /** Spend recorded so far this (in-progress) month. */
  spentSoFar: number;
  /** Day-of-month of `now` (UTC), i.e. days elapsed including today. */
  daysElapsed: number;
  /** Total days in the current month (UTC). */
  daysInMonth: number;
  /** Linear end-of-month estimate: `round(spentSoFar / daysElapsed * daysInMonth)`. */
  projected: number;
}

export interface SpendingTrendStats {
  /** Count of completed months that have spending (excludes the in-progress month and gaps). */
  completedMonths: number;
  /** Whether there are at least `minMonths` completed months with data. */
  hasEnoughHistory: boolean;
  /** Mean spending over up to `maxMonths` most-recent completed months; null without enough history. */
  trailingAverage: number | null;
  /** The most recent completed month with data (the "last month" reference); null if none. */
  lastCompleted: MonthlySpendPoint | null;
  /** How far `lastCompleted` sits from `trailingAverage`, in percent; null without enough history. */
  vsAveragePct: number | null;
  /** The in-progress current month projected to month-end; null if the series has no current point. */
  projection: MonthProjection | null;
}

export interface TrailingOptions {
  minMonths?: number;
  maxMonths?: number;
}

/** Defaults from the dashboard design: need ≥3 completed months; average over up to 12. */
export const DEFAULT_TRAILING: Required<TrailingOptions> = { minMonths: 3, maxMonths: 12 };

/**
 * Linear month-end projection for the in-progress month containing `now`, from `spentSoFar` over the
 * elapsed UTC days. Month, length, and elapsed days are all derived from `now`, so they can never
 * disagree — the caller only supplies the amount spent so far this month.
 */
export function projectMonth(spentSoFar: number, now: Date): MonthProjection {
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth(); // 0-based
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const daysElapsed = now.getUTCDate();
  return {
    month: currentCycleKey(now),
    spentSoFar,
    daysElapsed,
    daysInMonth,
    projected: Math.round((spentSoFar / daysElapsed) * daysInMonth),
  };
}

/** Compute {@link SpendingTrendStats} for a gap-filled monthly series relative to `now`. */
export function computeSpendingTrendStats(
  series: ReadonlyArray<MonthlySpendPoint>,
  now: Date,
  options: TrailingOptions = {},
): SpendingTrendStats {
  const { minMonths, maxMonths } = { ...DEFAULT_TRAILING, ...options };
  const currentKey = currentCycleKey(now);

  // Sort a copy oldest-first so callers need not guarantee order; month keys sort lexicographically
  // the same as chronologically, so a plain string compare is safe.
  const ordered = [...series].sort((a, b) => a.month.localeCompare(b.month));
  const completed = ordered.filter((p) => p.month < currentKey && p.spending > 0);
  const completedMonths = completed.length;
  const hasEnoughHistory = completedMonths >= minMonths;

  const windowMonths = completed.slice(-maxMonths);
  const trailingAverage = hasEnoughHistory
    ? Math.round(windowMonths.reduce((sum, p) => sum + p.spending, 0) / windowMonths.length)
    : null;

  const lastCompleted = completed[completed.length - 1] ?? null;
  const vsAveragePct =
    trailingAverage !== null && trailingAverage > 0 && lastCompleted !== null
      ? Math.round(((lastCompleted.spending - trailingAverage) / trailingAverage) * 100)
      : null;

  const currentPoint = ordered.find((p) => p.month === currentKey) ?? null;
  const projection = currentPoint ? projectMonth(currentPoint.spending, now) : null;

  return {
    completedMonths,
    hasEnoughHistory,
    trailingAverage,
    lastCompleted,
    vsAveragePct,
    projection,
  };
}
