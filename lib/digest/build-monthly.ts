import type { CategoryTrendPoint } from "@/lib/dashboard/category-trend";
import type { CycleKey } from "@/lib/dashboard/cycle";
import type { MonthlySpendPoint } from "@/lib/dashboard/monthly-series";
import type { Mover } from "@/lib/dashboard/movers";
import type { SavingsAssessment } from "@/lib/savings/assessment";
import { TYPES, type RealType } from "@/shared/types";

/** How many rising merchants the Digest highlights. */
const TOP_MOVERS = 3;

/** The savings figures the Digest shows; a full {@link SavingsAssessment} is assignable to this. */
export type DigestSavings = Pick<SavingsAssessment, "onTrack" | "allowedNiceToHave">;

/**
 * Everything {@link buildMonthlyDigest} needs, already loaded by the cron (slice 5). Deliberately
 * narrow — a curated subset of the dashboard view-model, not the whole {@link DashboardView} — so the
 * builder stays a pure, well-typed function of its inputs.
 */
export interface MonthlyDigestInput {
  /** The just-closed Statement cycle the Digest covers. */
  cycleKey: CycleKey;
  /** Household billing currency, carried through for slice-3 formatting. */
  currency: string;
  /** The closed cycle's totals (spending magnitude, income, difference). */
  cycle: MonthlySpendPoint;
  /** The cycle immediately before, for the vs-prior delta; null when there is no prior cycle. */
  priorCycle: MonthlySpendPoint | null;
  /** The closed cycle's debit magnitude per real expense type (from the category trend). */
  byExpenseType: CategoryTrendPoint["byExpenseType"];
  /** Precomputed merchant movers for the cycle. */
  movers: Mover[];
  /** The goal assessment, or null when the Household has no active Savings goal. */
  savings: DigestSavings | null;
}

/** A rising merchant highlighted in the Digest. */
export interface DigestMover {
  name: string;
  amount: number;
  delta: number;
}

/** A non-zero expense-type bucket for the cycle. */
export interface DigestExpenseBucket {
  type: RealType;
  amount: number;
}

/**
 * The render-ready Digest view-model: pure numbers + flags, no locale/formatting (slice 3 renders it
 * per-Member via the message catalogs + lib/format/*).
 */
export interface MonthlyDigestModel {
  cycleKey: CycleKey;
  currency: string;
  /** False when the cycle had neither spending nor income — the cron skips these (belt-and-suspenders). */
  hasActivity: boolean;
  spending: number;
  income: number;
  difference: number;
  /** Change in spending vs the prior cycle; null when there is no prior cycle. */
  spendingDelta: { abs: number; pct: number | null } | null;
  /** Non-zero expense-type buckets, largest first. */
  expenseSplit: DigestExpenseBucket[];
  /** Up to {@link TOP_MOVERS} merchants whose spend rose vs their baseline, biggest rise first. */
  topMovers: DigestMover[];
  /** On-track status + coming cycle's Allowed nice-to-have; null when no active goal. */
  savings: { onTrack: boolean; allowedNiceToHave: number } | null;
}

/**
 * Reshape the loaded cycle pieces into the render-ready {@link MonthlyDigestModel} (#102, ADR-0019).
 * Pure and computed — no I/O, no AI — so the Digest can never disagree with the dashboard or invent a
 * number. The delta is vs the prior cycle, the split keeps only non-zero real buckets (largest first),
 * and the highlighted movers are the biggest *risers* (falling merchants aren't a re-engagement hook).
 */
export function buildMonthlyDigest(input: MonthlyDigestInput): MonthlyDigestModel {
  const { cycle, priorCycle } = input;

  const spendingDelta =
    priorCycle === null
      ? null
      : {
          abs: cycle.spending - priorCycle.spending,
          pct: priorCycle.spending > 0 ? (cycle.spending - priorCycle.spending) / priorCycle.spending : null,
        };

  const expenseSplit = TYPES.map((type) => ({ type, amount: input.byExpenseType[type] ?? 0 }))
    .filter((bucket) => bucket.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const topMovers = input.movers
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, TOP_MOVERS)
    .map((m) => ({ name: m.name, amount: m.lastMonth, delta: m.delta }));

  return {
    cycleKey: input.cycleKey,
    currency: input.currency,
    hasActivity: cycle.spending > 0 || cycle.income > 0,
    spending: cycle.spending,
    income: cycle.income,
    difference: cycle.difference,
    spendingDelta,
    expenseSplit,
    topMovers,
    savings: input.savings
      ? { onTrack: input.savings.onTrack, allowedNiceToHave: input.savings.allowedNiceToHave }
      : null,
  };
}
