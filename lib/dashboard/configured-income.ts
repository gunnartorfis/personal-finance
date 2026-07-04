import type { HouseholdRepo } from "@/lib/db/household-repo";
import { resolveCycleAmounts, timelinesByName } from "@/shared/income-timeline";

import type { CycleKey } from "./cycle";

/**
 * The configured income in force for each of `cycleKeys`: every recurring Income-settings source's
 * version in force that cycle plus that cycle's one-off income adjustments (ADR-0015), resolved from
 * the same effective-dated timelines the Savings math reads. Off-card costs never bear on income, so
 * the resolver is fed empty cost timelines and only `monthlyIncome` is kept. Cycles with no
 * configured income resolve to 0. Returns a Map keyed by cycle so callers can look one up directly.
 */
export async function loadConfiguredIncomeByCycle(
  repo: HouseholdRepo,
  cycleKeys: ReadonlyArray<CycleKey>,
): Promise<Map<CycleKey, number>> {
  if (cycleKeys.length === 0) return new Map();
  const [sources, oneOffs] = await Promise.all([
    repo.savings.incomeSources.list(),
    repo.savings.oneOffAdjustments.list(),
  ]);
  const resolved = resolveCycleAmounts(
    {
      incomeSources: timelinesByName(sources, (s) => s.amount),
      offcardCostSources: [],
      incomeOneOffs: oneOffs
        .filter((o) => o.kind === "income")
        .map((o) => ({ cycleKey: o.cycleKey, amount: o.amount })),
      costOneOffs: [],
    },
    cycleKeys,
  );
  return new Map(cycleKeys.map((key) => [key, resolved.get(key)!.monthlyIncome]));
}

/** Configured income for a single cycle (see {@link loadConfiguredIncomeByCycle}); 0 if none. */
export async function loadConfiguredIncome(
  repo: HouseholdRepo,
  cycleKey: CycleKey,
): Promise<number> {
  return (await loadConfiguredIncomeByCycle(repo, [cycleKey])).get(cycleKey) ?? 0;
}
