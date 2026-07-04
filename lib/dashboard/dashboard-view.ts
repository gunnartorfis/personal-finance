import { freeCapStatus, type FreeCapStatus } from "@/lib/billing/free-cap-status";
import type { HouseholdRepo } from "@/lib/db/household-repo";
import { reconnectPrompts, type ReconnectPrompt } from "@/lib/open-banking/reconnect";
import type { Plan, RealType } from "@/shared/types";

import type { AccountSpend } from "./account-breakdown";
import { loadAccountBreakdown } from "./account-breakdown";
import type { BudgetStatus } from "./budget-status";
import { computeBudgetStatus } from "./budget-status";
import type { CategoryTrendPoint } from "./category-trend";
import { loadCategoryTrend } from "./category-trend";
import type { CycleKey } from "./cycle";
import { currentCycleKey, cycleKeyRange, recentCycleKeys } from "./cycle";
import type { FinancialHealth } from "./financial-health";
import { loadFinancialHealth } from "./financial-health";
import type { MonthlySpendPoint } from "./monthly-series";
import { loadMonthlySpendSeries } from "./monthly-series";
import type { LargestCharge, Mover } from "./movers";
import { loadBiggestMovers, loadLargestCharge } from "./movers";
import type { RecurringSummary } from "./recurring";
import { loadRecurring } from "./recurring";
import { compareCycleToAverage, computeSpendingTrendStats, type SpendingTrendStats } from "./spending-trend";
import type { MerchantSpend } from "./top-merchants";
import { loadTopMerchants } from "./top-merchants";

/** How many trailing months feed the "recent spending" modules (top merchants, account split). */
const RECENT_MONTHS = 3;
/** Top-N merchants shown. */
const TOP_MERCHANTS = 6;

/** Everything the pure {@link assembleDashboardView} needs (all already loaded). */
export interface DashboardInputs {
  now: Date;
  /** The cycle the hero shows; defaults to the month containing `now` when omitted. */
  selectedKey?: CycleKey;
  series: MonthlySpendPoint[];
  trend: SpendingTrendStats;
  topMerchants: MerchantSpend[];
  categoryTrend: CategoryTrendPoint[];
  movers: { merchants: Mover[]; categories: Mover[] };
  /** Detected recurring/subscription charges + total committed monthly spend (#100). */
  recurring: RecurringSummary;
  /** Per-category monthly budgets (#103), keyed by expense type; empty when none are set. */
  budgets: Partial<Record<RealType, number>>;
  largestCharge: LargestCharge | null;
  accountBreakdown: AccountSpend[];
  /** The Household's total Account count — the account module is shown only when this is > 1. */
  accountCount: number;
  /** Trailing financial-health metrics (savings rate, typical saving, profit streak). */
  financialHealth: FinancialHealth;
  reviewBacklog: number;
  pendingCount: number;
  failedCount: number;
  freeCap: FreeCapStatus;
  /** Bank connections needing re-consent (#116); empty for households with none. */
  reconnect: ReconnectPrompt[];
}

/** The selected-cycle headline (spending is the hero; Income / Difference are secondary). */
export interface DashboardHero {
  month: CycleKey;
  /** Whether `month` is the in-progress current cycle (vs a completed past month being viewed). */
  isCurrent: boolean;
  spentSoFar: number;
  projected: number | null;
  income: number;
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
  /** Detected recurring/subscription charges + total committed monthly spend (#100). */
  recurring: RecurringSummary;
  /** Per-category budget envelopes vs current-cycle spend (#103); no envelopes when none are set. */
  budgetStatus: BudgetStatus;
  /** Null when the Household has a single Account (module hidden). */
  accounts: AccountSpend[] | null;
}

/** Operational alerts; each surfaces only when non-zero/paused, else the band is all-clear. */
export interface DashboardActionBand {
  reviewBacklog: number;
  /** Transactions still awaiting AI classification — drives the "Classify pending" affordance. */
  pendingCount: number;
  failedCount: number;
  freeCap: FreeCapStatus;
  /** Bank connections needing re-consent (#116). */
  reconnect: ReconnectPrompt[];
  allClear: boolean;
}

export interface DashboardView {
  hero: DashboardHero;
  modules: DashboardModules;
  actionBand: DashboardActionBand;
  /** Trailing profit/savings health (ADR-0016); the section gates its own thin-data display. */
  financialHealth: FinancialHealth;
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
 * unit-tested directly; the reads live in {@link loadDashboardView}. The hero comes from the
 * selected cycle (the current month by default) and the trend stats; module display is gated by
 * history/classification/account-count flags; the action band is all-clear only when nothing needs
 * attention.
 *
 * The hero adapts to whether the selected month is in progress or complete: the current month leads
 * with spend-so-far, its month-end projection, and the trend's "last completed month vs average"
 * read; a past month leads with its final total (no projection) and its own spend-vs-average.
 */
export function assembleDashboardView(input: DashboardInputs): DashboardView {
  const currentKey = currentCycleKey(input.now);
  const selectedKey = input.selectedKey ?? currentKey;
  const isCurrent = selectedKey === currentKey;
  const selected = input.series.find((point) => point.month === selectedKey);
  const spentSoFar = selected?.spending ?? 0;
  const income = selected?.income ?? 0;

  // The vs-average line: for the in-progress month, reuse the trend's honest "last completed month
  // vs average" (never the partial current spend); for a past month, compare that month to the
  // average of the completed months before it.
  const comparison = isCurrent
    ? { vsAveragePct: input.trend.vsAveragePct, trailingAverage: input.trend.trailingAverage }
    : compareCycleToAverage(input.series, selectedKey);

  // Budget envelopes always track the current cycle's spend (they are a live "this month" gauge, not
  // tied to the hero's selected month), taken from the already-loaded category trend (no extra
  // query) — its byExpenseType holds debit magnitudes.
  const currentCategorySpend = input.categoryTrend.find((point) => point.month === currentKey);
  const budgetStatus = computeBudgetStatus(input.budgets, currentCategorySpend?.byExpenseType ?? {});

  return {
    hero: {
      month: selectedKey,
      isCurrent,
      spentSoFar,
      // Only the in-progress month is projected; a completed month's total is already final.
      projected: isCurrent ? (input.trend.projection?.projected ?? null) : null,
      income,
      difference: income - spentSoFar,
      vsAveragePct: comparison.vsAveragePct,
      trailingAverage: comparison.trailingAverage,
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
      recurring: input.recurring,
      budgetStatus,
      accounts: input.accountCount > 1 ? input.accountBreakdown : null,
    },
    actionBand: {
      reviewBacklog: input.reviewBacklog,
      pendingCount: input.pendingCount,
      failedCount: input.failedCount,
      freeCap: input.freeCap,
      reconnect: input.reconnect,
      allClear:
        input.reviewBacklog === 0 &&
        input.pendingCount === 0 &&
        input.failedCount === 0 &&
        !input.freeCap.paused &&
        input.reconnect.length === 0,
    },
    financialHealth: input.financialHealth,
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
  { plan, count = 12, selectedKey }: { plan: Plan; count?: number; selectedKey?: CycleKey },
): Promise<DashboardView> {
  // The hero's cycle (the current month by default); scopes its largest-charge read.
  const heroKey = selectedKey ?? currentCycleKey(now);
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
    pendingCount,
    failedCount,
    classifiedCount,
    connections,
    financialHealth,
    recurring,
    budgetRows,
  ] = await Promise.all([
    loadMonthlySpendSeries(repo, now, count),
    loadTopMerchants(repo, recentRange, TOP_MERCHANTS),
    loadCategoryTrend(repo, now, count),
    loadLargestCharge(repo, heroKey),
    loadAccountBreakdown(repo, recentRange),
    repo.accounts.list(),
    repo.transactions.reviewQueueMonths(),
    repo.transactions.countPending(),
    repo.transactions.countFailed(),
    repo.transactions.countClassified(),
    repo.bankConnections.list(),
    loadFinancialHealth(repo, now, count),
    loadRecurring(repo, now),
    repo.budgets.list(),
  ]);

  // The expense_type CHECK constraint guarantees each row's type is a RealType.
  const budgets = Object.fromEntries(
    budgetRows.map((b) => [b.expenseType, b.monthlyAmount]),
  ) as Partial<Record<RealType, number>>;

  // Reuse the already-loaded category trend for the category movers (avoids a second query).
  const movers = await loadBiggestMovers(repo, now, count, categoryTrend);
  const trend = computeSpendingTrendStats(series, now);
  const reviewBacklog = reviewMonths.reduce((sum, month) => sum + month.count, 0);
  const freeCap = freeCapStatus({ plan, classifiedCount });

  return assembleDashboardView({
    now,
    selectedKey: heroKey,
    series,
    trend,
    topMerchants,
    categoryTrend,
    movers,
    recurring,
    budgets,
    largestCharge,
    accountBreakdown,
    accountCount: accountList.length,
    financialHealth,
    reviewBacklog,
    pendingCount,
    failedCount,
    freeCap,
    reconnect: reconnectPrompts(connections, now),
  });
}
