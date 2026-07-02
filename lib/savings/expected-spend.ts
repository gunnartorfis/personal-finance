import { currentCycleKey, cycleKeyRange, previousCycleKey } from "@/lib/dashboard/cycle";
import { loadNetSummary } from "@/lib/dashboard/net-summary";
import type { HouseholdRepo } from "@/lib/db/household-repo";
import { estimateExpectedSpend } from "@/shared/savings";
import type { ExpectedSpend } from "@/shared/savings";

/** How many completed Statement cycles feed the trailing average (ADR-0007: "last ~3"). */
const TRAILING_CYCLES = 3;

/**
 * Expected `Fixed`/`Necessary` card spend for the coming cycle, estimated from the last
 * {@link TRAILING_CYCLES} COMPLETED Statement cycles' net summaries — the current (partial)
 * cycle is excluded so a mid-month read never halves the estimate. When none of those cycles
 * carries classified spend, the manual `fallback` is used; with neither, zeros with
 * `source: "none"` (the caller should ask for manual values).
 */
export async function loadExpectedSpend(
  repo: HouseholdRepo,
  now: Date,
  fallback?: { expectedFixed: number; expectedNecessary: number },
): Promise<ExpectedSpend> {
  const keys: string[] = [];
  let key = previousCycleKey(currentCycleKey(now));
  for (let i = 0; i < TRAILING_CYCLES; i++) {
    keys.push(key);
    key = previousCycleKey(key);
  }
  const summaries = await Promise.all(
    keys.map((k) => loadNetSummary(repo, cycleKeyRange(k))),
  );
  const cycles = summaries.map((summary) => ({
    fixed: summary.byExpenseType.Fixed,
    necessary: summary.byExpenseType.Necessary,
  }));
  return estimateExpectedSpend(cycles, fallback);
}
