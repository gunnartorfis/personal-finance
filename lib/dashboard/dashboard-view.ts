import { freeCapStatus, type FreeCapStatus } from "@/lib/billing/free-cap-status";
import type { HouseholdRepo } from "@/lib/db/household-repo";
import { reconnectPrompts, type ReconnectPrompt } from "@/lib/open-banking/reconnect";
import type { Plan, RealType } from "@/shared/types";

import type { AccountSpend } from "./account-breakdown";
import { loadAccountBreakdown } from "./account-breakdown";
import type { BudgetStatus } from "./budget-status";
import { computeBudgetStatus } from "./budget-status";
import type { CategoryBreakdown } from "./category-breakdown";
import { loadCategoryBreakdown } from "./category-breakdown";
import type { CategoryTrendPoint } from "./category-trend";
import { categoryPointToNetSummary, loadCategoryTrend } from "./category-trend";
import type { CycleKey } from "./cycle";
import { currentCycleKey, cycleKeyRange, recentCycleKeys } from "./cycle";
import type { FinancialHealth } from "./financial-health";
import { loadFinancialHealth } from "./financial-health";
import type { MonthlySpendPoint } from "./monthly-series";
import { loadMonthlySpendSeries } from "./monthly-series";
import { addConfiguredAmounts, type NetSummary } from "./net-summary";
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

/**
 * A Category leaf's identity + label parts (ADR-0020) — the minimum the breakdown chart needs to
 * localize a `category_id`. Structurally the chart's `CategoryChartLeaf`, kept in the lib layer so
 * the view-model doesn't depend on the component.
 */
export interface CategoryLeafLabel {
  id: string;
  /** i18n key (namespace `categories`) for a seed row; null on a custom row. */
  labelKey: string | null;
  /** Literal label for a custom row; null on a seed row. */
  label: string | null;
}

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
  /** Trailing-window spend split by semantic Category (ADR-0020) — the Category-axis breakdown. */
  categoryBreakdown: CategoryBreakdown;
  /** The Household's Category leaves (id + label parts) to localize the breakdown chart. */
  categories: CategoryLeafLabel[];
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
  /** Total spend for the cycle: card debits plus configured off-card fixed costs (ADR-0015). */
  spentSoFar: number;
  /** The card-debit portion of `spentSoFar` (its by-type buckets sum to this). */
  cardSpend: number;
  /** The configured off-card fixed portion of `spentSoFar`; 0 when the Household has none. */
  offCardFixed: number;
  /**
   * The cycle's spend split by effective expense type (signed, ≤ 0) for the by-type breakdown, with
   * the configured off-card fixed costs folded into `Fixed` (ADR-0015) so it reconciles to
   * `spentSoFar` — matching the "Hvert það fer" module and the Transactions overview.
   */
  spendByType: NetSummary;
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
  /** Trailing-window spend split by semantic Category (ADR-0020), for the breakdown chart. */
  categoryBreakdown: CategoryBreakdown;
  /** The Household's Category leaves (id + label parts) that localize the breakdown chart. */
  categories: CategoryLeafLabel[];
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

  // Decompose the hero total into its two ADR-0015 sources so the card can show card spend and
  // off-card fixed separately, plus the card debits' by-type split — all from the already-loaded
  // category trend (no extra query). The trend and the series share the same card-debit SQL, so the
  // by-type buckets sum to the cycle's card debits; the remainder of `spentSoFar` is the configured
  // off-card fixed (>= 0, clamped for safety).
  const cardByType = categoryPointToNetSummary(
    input.categoryTrend.find((point) => point.month === selectedKey),
  );
  const cardSpend = -cardByType.expense;
  const offCardFixed = Math.max(0, spentSoFar - cardSpend);
  // Fold the off-card fixed costs into Fixed so the by-type breakdown reconciles to the full total,
  // consistent with the "Hvert það fer" module; the card/off-card source split stays derived from
  // the card-only figures above.
  const spendByType = addConfiguredAmounts(cardByType, { monthlyIncome: 0, offCardFixed });

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
      cardSpend,
      offCardFixed,
      spendByType,
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
      categoryBreakdown: input.categoryBreakdown,
      categories: input.categories,
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
    categoryBreakdown,
    categoryRows,
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
    // The Category breakdown covers the trailing window (like top-merchants / accounts), not the
    // hero cycle — so it stays populated even when the current month is sparse (ADR-0020).
    loadCategoryBreakdown(repo, recentRange),
    repo.categories.list(),
  ]);

  // Only leaf Categories bear a `category_id` a Transaction can carry, so only leaves label the
  // breakdown chart; the parent groups are dashboard rollups (ADR-0020).
  const categories: CategoryLeafLabel[] = categoryRows
    .filter((row) => row.parentId !== null)
    .map((row) => ({ id: row.id, labelKey: row.labelKey, label: row.label }));

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
    categoryBreakdown,
    categories,
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
