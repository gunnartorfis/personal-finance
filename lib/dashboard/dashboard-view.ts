import { freeCapStatus, type FreeCapStatus } from "@/lib/billing/free-cap-status";
import type { HouseholdRepo } from "@/lib/db/household-repo";
import type { Plan } from "@/shared/types";

import type { AccountSpend } from "./account-breakdown";
import { loadAccountBreakdown } from "./account-breakdown";
import type { CategoryTrendPoint } from "./category-trend";
import { loadCategoryTrend } from "./category-trend";
import type { CycleKey } from "./cycle";
import { currentCycleKey, cycleKeyRange, recentCycleKeys } from "./cycle";
import type { MonthlySpendPoint } from "./monthly-series";
import { loadMonthlySpendSeries } from "./monthly-series";
import type { LargestCharge, Mover } from "./movers";
import { loadBiggestMovers, loadLargestCharge } from "./movers";
import { computeSpendingTrendStats, type SpendingTrendStats } from "./spending-trend";
import type { MerchantSpend } from "./top-merchants";
import { loadTopMerchants } from "./top-merchants";

/** How many trailing months feed the "recent spending" modules (top merchants, account split). */
const RECENT_MONTHS = 3;
/** Top-N merchants shown. */
const TOP_MERCHANTS = 6;

/** Everything the pure {@link assembleDashboardView} needs (all already loaded). */
export interface DashboardInputs {
  now: Date;
  series: MonthlySpendPoint[];
  trend: SpendingTrendStats;
  topMerchants: MerchantSpend[];
  categoryTrend: CategoryTrendPoint[];
  movers: { merchants: Mover[]; categories: Mover[] };
  largestCharge: LargestCharge | null;
  accountBreakdown: AccountSpend[];
  /** The Household's total Account count — the account module is shown only when this is > 1. */
  accountCount: number;
  reviewBacklog: number;
  failedCount: number;
  freeCap: FreeCapStatus;
}

/** The current-cycle headline (spending is the hero; Money in / Difference are secondary). */
export interface DashboardHero {
  month: CycleKey;
  spentSoFar: number;
  projected: number | null;
  moneyIn: number;
  difference: number;
  vsAveragePct: number | null;
  trailingAverage: number | null;
  largestCharge: LargestCharge | null;
}

/** The over-time modules plus the flags that gate their display (progressive thin-data). */
export interface DashboardModules {
  hasEnoughHistory: boolean;
  completedMonths: number;
  series: MonthlySpendPoint[];
  categoryTrend: CategoryTrendPoint[];
  /** True when unclassified spend outweighs classified — drives the "classify to unlock" nudge. */
  categoryMostlyUnclassified: boolean;
  topMerchants: MerchantSpend[];
  movers: { merchants: Mover[]; categories: Mover[] };
  /** Null when the Household has a single Account (module hidden). */
  accounts: AccountSpend[] | null;
}

/** Operational alerts; each surfaces only when non-zero/paused, else the band is all-clear. */
export interface DashboardActionBand {
  reviewBacklog: number;
  failedCount: number;
  freeCap: FreeCapStatus;
  allClear: boolean;
}

export interface DashboardView {
  hero: DashboardHero;
  modules: DashboardModules;
  actionBand: DashboardActionBand;
}

/** Whether unclassified spend outweighs classified spend across the trend window. */
function isCategoryMostlyUnclassified(trend: ReadonlyArray<CategoryTrendPoint>): boolean {
  let classified = 0;
  let unclassified = 0;
  for (const point of trend) {
    unclassified += point.unclassified;
    for (const value of Object.values(point.byExpenseType)) classified += value;
  }
  return unclassified > classified;
}

/**
 * Assemble the loaded pieces (K2–K7) into a {@link DashboardView} (Phase K, ADR-0008). Pure and
 * unit-tested directly; the reads live in {@link loadDashboardView}. The hero comes from the current
 * cycle and the trend stats; module display is gated by history/classification/account-count flags;
 * the action band is all-clear only when nothing needs attention.
 */
export function assembleDashboardView(input: DashboardInputs): DashboardView {
  const currentKey = currentCycleKey(input.now);
  const current = input.series.find((point) => point.month === currentKey);
  const spentSoFar = current?.spending ?? 0;
  const moneyIn = current?.moneyIn ?? 0;

  return {
    hero: {
      month: currentKey,
      spentSoFar,
      projected: input.trend.projection?.projected ?? null,
      moneyIn,
      difference: moneyIn - spentSoFar,
      vsAveragePct: input.trend.vsAveragePct,
      trailingAverage: input.trend.trailingAverage,
      largestCharge: input.largestCharge,
    },
    modules: {
      hasEnoughHistory: input.trend.hasEnoughHistory,
      completedMonths: input.trend.completedMonths,
      series: input.series,
      categoryTrend: input.categoryTrend,
      categoryMostlyUnclassified: isCategoryMostlyUnclassified(input.categoryTrend),
      topMerchants: input.topMerchants,
      movers: input.movers,
      accounts: input.accountCount > 1 ? input.accountBreakdown : null,
    },
    actionBand: {
      reviewBacklog: input.reviewBacklog,
      failedCount: input.failedCount,
      freeCap: input.freeCap,
      allClear: input.reviewBacklog === 0 && input.failedCount === 0 && !input.freeCap.paused,
    },
  };
}

/**
 * Load every dashboard building block for the Household and assemble the view. The 12-month window
 * drives the trend/category modules; the trailing {@link RECENT_MONTHS} feed top merchants and the
 * account split; the action band comes from the review backlog, failed count, and Free-cap state.
 */
export async function loadDashboardView(
  repo: HouseholdRepo,
  now: Date,
  { plan, count = 12 }: { plan: Plan; count?: number },
): Promise<DashboardView> {
  const recentKeys = recentCycleKeys(now, RECENT_MONTHS);
  const recentRange = {
    from: cycleKeyRange(recentKeys[0]).from,
    to: cycleKeyRange(recentKeys[recentKeys.length - 1]).to,
  };

  const [
    series,
    topMerchants,
    categoryTrend,
    largestCharge,
    accountBreakdown,
    accountList,
    reviewMonths,
    failedCount,
    classifiedCount,
  ] = await Promise.all([
    loadMonthlySpendSeries(repo, now, count),
    loadTopMerchants(repo, recentRange, TOP_MERCHANTS),
    loadCategoryTrend(repo, now, count),
    loadLargestCharge(repo, now),
    loadAccountBreakdown(repo, recentRange),
    repo.accounts.list(),
    repo.transactions.reviewQueueMonths(),
    repo.transactions.countFailed(),
    repo.transactions.countClassified(),
  ]);

  // Reuse the already-loaded category trend for the category movers (avoids a second query).
  const movers = await loadBiggestMovers(repo, now, count, categoryTrend);
  const trend = computeSpendingTrendStats(series, now);
  const reviewBacklog = reviewMonths.reduce((sum, month) => sum + month.count, 0);
  const freeCap = freeCapStatus({ plan, classifiedCount });

  return assembleDashboardView({
    now,
    series,
    trend,
    topMerchants,
    categoryTrend,
    movers,
    largestCharge,
    accountBreakdown,
    accountCount: accountList.length,
    reviewBacklog,
    failedCount,
    freeCap,
  });
}
