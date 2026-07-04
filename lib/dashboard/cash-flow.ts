import type { CycleKey } from "./cycle";
import { nextCycleKey } from "./cycle";

/** One cycle on the cash-flow forecast: its net flow that cycle and the running balance after it. */
export interface CashFlowPoint {
  cycleKey: CycleKey;
  /** Cycles from `startCycle` (0 = the anchor, no flow yet). */
  monthIndex: number;
  /** Expected net cash flow for this cycle (income − outflow); 0 at the anchor. */
  net: number;
  /** Running balance after this cycle's flow. */
  balance: number;
}

/** A straight-line cash-flow forecast: per-cycle net flow, running balance, and the horizon total. */
export interface CashFlowForecast {
  points: CashFlowPoint[];
  /** Net cash flow expected over the whole horizon (`monthlyNet * months`). */
  horizonNet: number;
}

/**
 * A straight-line cash-flow forecast (companion to {@link projectNetWorth}, #103): the expected net
 * flow each upcoming cycle carried onto a running balance, plus the horizon total. Index 0 is the
 * anchor (current balance, no flow), so the series has `months + 1` points. `monthlyNet` may be
 * negative — an overspending stretch projects a declining balance, the honest picture. Pure; the
 * caller supplies the starting balance and typical monthly net (trailing average) it already has.
 */
export function projectCashFlow(input: {
  startingBalance: number;
  monthlyNet: number;
  startCycle: CycleKey;
  months: number;
}): CashFlowForecast {
  const points: CashFlowPoint[] = [];
  let cycleKey = input.startCycle;
  for (let monthIndex = 0; monthIndex <= input.months; monthIndex++) {
    points.push({
      cycleKey,
      monthIndex,
      net: monthIndex === 0 ? 0 : Math.round(input.monthlyNet),
      balance: Math.round(input.startingBalance + input.monthlyNet * monthIndex),
    });
    cycleKey = nextCycleKey(cycleKey);
  }
  return { points, horizonNet: Math.round(input.monthlyNet * input.months) };
}
