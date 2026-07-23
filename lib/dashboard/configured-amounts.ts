import type { HouseholdRepo } from "@/lib/db/household-repo";
import type { CycleAmounts, TimelineInput } from "@/shared/income-timeline";
import { inForceByName, resolveCycleAmounts, timelinesByName } from "@/shared/income-timeline";

import type { CycleKey } from "./cycle";

/** All-zero configured amounts — the resolution for a cycle before any source starts. */
const NO_AMOUNTS: CycleAmounts = { monthlyIncome: 0, offCardFixed: 0 };

/** One recurring off-card cost source in force at a cycle: its name and the amount it contributes. */
export interface OffCardCostItem {
  name: string;
  amount: number;
}

/** One one-off adjustment landing on a cycle: its optional label and the amount it contributes. */
export interface OneOffItem {
  /** The Member's free-text label (e.g. "Tax refund"); null when they left it blank. */
  label: string | null;
  amount: number;
}

/**
 * A cycle's configured amounts itemized for the Transactions overview (ADR-0015): each recurring
 * off-card cost source and each one-off adjustment on its own, so the reader sees exactly which
 * non-card amounts are folded into the period totals. Income sources stay a single total —
 * the overview's Income line already shows it, so it's only worth repeating when they diverge.
 */
export interface ConfiguredCycleItems {
  /** Recurring income sources in force this cycle, summed (salary, rent received, …). */
  incomeSourcesTotal: number;
  /** Recurring off-card fixed costs in force this cycle, one entry per source (rent, a loan, …). */
  offCardCosts: OffCardCostItem[];
  /** One-off cost adjustments landing on this cycle (a one-time bill). */
  oneOffCosts: OneOffItem[];
  /** One-off income adjustments landing on this cycle (a bonus, a refund). */
  oneOffIncomes: OneOffItem[];
}

/** Empty itemization — the resolution for a cycle with nothing configured. */
const NO_ITEMS: ConfiguredCycleItems = {
  incomeSourcesTotal: 0,
  offCardCosts: [],
  oneOffCosts: [],
  oneOffIncomes: [],
};

/**
 * Fetch a Household's recurring income/off-card-cost timelines and one-off adjustments, shaped into
 * the {@link TimelineInput} the pure resolver ({@link resolveCycleAmounts}) consumes. One read of the
 * three savings sources.
 */
async function loadTimelineInput(repo: HouseholdRepo): Promise<TimelineInput> {
  const [sources, costs, oneOffs] = await Promise.all([
    repo.savings.incomeSources.list(),
    repo.savings.offcardCosts.list(),
    repo.savings.oneOffAdjustments.list(),
  ]);
  return {
    incomeSources: timelinesByName(sources, (s) => s.amount),
    offcardCostSources: timelinesByName(costs, (c) => c.monthlyAmount),
    incomeOneOffs: oneOffs
      .filter((o) => o.kind === "income")
      .map((o) => ({ cycleKey: o.cycleKey, amount: o.amount })),
    costOneOffs: oneOffs
      .filter((o) => o.kind === "cost")
      .map((o) => ({ cycleKey: o.cycleKey, amount: o.amount })),
  };
}

/**
 * The configured amounts in force for each of `cycleKeys`: every recurring Income-settings source's
 * version in force that cycle plus that cycle's one-off adjustments (ADR-0015), for both the
 * Monthly income and the Off-card fixed costs. Resolved from the same effective-dated timelines the
 * Savings math reads. Cycles with no configured amounts resolve to zeros. Returns a Map keyed by
 * cycle so callers can look one up directly, and read whichever side (`monthlyIncome` /
 * `offCardFixed`) the surface needs.
 */
export async function loadConfiguredAmountsByCycle(
  repo: HouseholdRepo,
  cycleKeys: ReadonlyArray<CycleKey>,
): Promise<Map<CycleKey, CycleAmounts>> {
  if (cycleKeys.length === 0) return new Map();
  return resolveCycleAmounts(await loadTimelineInput(repo), cycleKeys);
}

/** Configured amounts for a single cycle (see {@link loadConfiguredAmountsByCycle}); zeros if none. */
export async function loadConfiguredAmounts(
  repo: HouseholdRepo,
  cycleKey: CycleKey,
): Promise<CycleAmounts> {
  return (await loadConfiguredAmountsByCycle(repo, [cycleKey])).get(cycleKey) ?? NO_AMOUNTS;
}

/**
 * The configured amounts for a single cycle, itemized for the Transactions overview (see
 * {@link ConfiguredCycleItems}); empty if none. Off-card cost sources resolving to 0 at the cycle
 * (not started, or a cleared loan) are dropped; one-offs are only those landing on the cycle, kept in
 * list order with their labels. {@link cycleAmountsFromItems} folds this back to the per-side totals.
 */
export async function loadConfiguredCycleItems(
  repo: HouseholdRepo,
  cycleKey: CycleKey,
): Promise<ConfiguredCycleItems> {
  const [sources, costs, oneOffs] = await Promise.all([
    repo.savings.incomeSources.list(),
    repo.savings.offcardCosts.list(),
    repo.savings.oneOffAdjustments.list(),
  ]);
  if (sources.length === 0 && costs.length === 0 && oneOffs.length === 0) return NO_ITEMS;

  // Largest first, so the biggest hidden amount reads first; deterministic regardless of row order.
  const byAmountDesc = <T extends { amount: number }>(entries: T[]): T[] =>
    entries.toSorted((a, b) => b.amount - a.amount);

  const incomeSourcesTotal = inForceByName(sources, (s) => s.amount, cycleKey).reduce(
    (sum, source) => sum + source.amount,
    0,
  );
  const oneOffsThisCycle = oneOffs.filter((o) => o.cycleKey === cycleKey);
  const toItem = (o: (typeof oneOffs)[number]): OneOffItem => ({ label: o.label, amount: o.amount });
  return {
    incomeSourcesTotal,
    offCardCosts: byAmountDesc(inForceByName(costs, (c) => c.monthlyAmount, cycleKey)),
    oneOffCosts: byAmountDesc(oneOffsThisCycle.filter((o) => o.kind === "cost").map(toItem)),
    oneOffIncomes: byAmountDesc(oneOffsThisCycle.filter((o) => o.kind === "income").map(toItem)),
  };
}

/** Fold itemized configured amounts back to the per-side {@link CycleAmounts} the overview adds in. */
export function cycleAmountsFromItems(items: ConfiguredCycleItems): CycleAmounts {
  const sum = (entries: ReadonlyArray<{ amount: number }>) =>
    entries.reduce((total, entry) => total + entry.amount, 0);
  return {
    monthlyIncome: items.incomeSourcesTotal + sum(items.oneOffIncomes),
    offCardFixed: sum(items.offCardCosts) + sum(items.oneOffCosts),
  };
}
