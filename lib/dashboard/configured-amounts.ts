import type { HouseholdRepo } from "@/lib/db/household-repo";
import type {
  CycleAmounts,
  CycleAmountsBreakdown,
  TimelineInput,
} from "@/shared/income-timeline";
import {
  resolveCycleAmounts,
  resolveCycleAmountsBreakdown,
  timelinesByName,
} from "@/shared/income-timeline";

import type { CycleKey } from "./cycle";

/** All-zero configured amounts — the resolution for a cycle before any source starts. */
const NO_AMOUNTS: CycleAmounts = { monthlyIncome: 0, offCardFixed: 0 };

/** All-zero breakdown — the resolution for a cycle before any source starts. */
const NO_BREAKDOWN: CycleAmountsBreakdown = {
  recurringIncome: 0,
  oneOffIncome: 0,
  recurringOffCardCost: 0,
  oneOffCost: 0,
};

/**
 * Fetch a Household's recurring income/off-card-cost timelines and one-off adjustments, shaped into
 * the {@link TimelineInput} the pure resolvers ({@link resolveCycleAmounts},
 * {@link resolveCycleAmountsBreakdown}) consume. One read of the three savings sources.
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
 * The configured amounts for a single cycle, split by recurring source vs one-off adjustment on each
 * side (see {@link resolveCycleAmountsBreakdown}); all-zeros if none. The Transactions overview uses
 * this to surface which non-card amounts are folded into its totals.
 */
export async function loadConfiguredAmountsBreakdown(
  repo: HouseholdRepo,
  cycleKey: CycleKey,
): Promise<CycleAmountsBreakdown> {
  return (
    resolveCycleAmountsBreakdown(await loadTimelineInput(repo), [cycleKey]).get(cycleKey) ??
    NO_BREAKDOWN
  );
}
