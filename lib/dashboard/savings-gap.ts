import type { HouseholdRepo } from "@/lib/db/household-repo"
import { loadSavingsSnapshot } from "@/lib/savings/assessment"

import { cycleKeyRange } from "./cycle"
import { loadNetWorthSeries, type NetWorthPoint } from "./net-worth"

/**
 * The Savings gap (ADR-0023, plan 007 slice 6): per Statement cycle, the Household's **inferred
 * saving** (flow — Monthly income − Off-card costs − net card debits, ADR-0007/0015) set against the
 * **observed net-worth change** (stock — the delta of the balance snapshots) over the same cycle.
 *
 * This module only ever **compares** the two independently-computed figures and reports their gap; it
 * NEVER merges them (ADR-0023). The inferred figures are read from the savings snapshot unchanged
 * (`lib/savings/*` is untouched), the observed side from {@link loadNetWorthSeries}, and nothing here
 * is written back — the gap is diagnostic only, never a Transaction, never Savings-goal progress, and
 * never fed into the inferred-savings math.
 */

/** One cycle's savings gap. `observedDelta`/`gap` are `null` for a cycle with no balance baseline. */
export interface SavingsGapCycle {
  cycleKey: string
  /** Inferred saving for the cycle (flow), from the savings selectors, unchanged. */
  inferred: number
  /** Observed net-worth change over the cycle (stock), or `null` when uncovered (see below). */
  observedDelta: number | null
  /** `inferred − observedDelta`; `null` when `observedDelta` is `null`. */
  gap: number | null
}

/**
 * Net worth as of `date` from the observed series (a step function): the latest point at or before
 * `date`, or `null` when none exists — before the first snapshot there is no baseline, so a change
 * across that boundary is not knowable. `series` is oldest-first.
 */
function netWorthAsOf(series: ReadonlyArray<NetWorthPoint>, date: Date): number | null {
  let value: number | null = null
  for (const point of series) {
    if (point.asOf.getTime() <= date.getTime()) value = point.total
    else break
  }
  return value
}

/**
 * Compare inferred saving against the observed net-worth change for each given cycle. A cycle is only
 * comparable when a balance baseline exists at or before its start (otherwise the "change" would count
 * the whole end balance and mislead) — such a cycle reports `observedDelta` / `gap` as `null`, which
 * the UI surfaces as a caveat rather than a number. Pure so it unit-tests directly.
 */
export function computeSavingsGap(
  cycles: ReadonlyArray<{ cycleKey: string; inferred: number }>,
  series: ReadonlyArray<NetWorthPoint>
): SavingsGapCycle[] {
  return cycles.map(({ cycleKey, inferred }) => {
    const { from, to } = cycleKeyRange(cycleKey)
    const startNw = netWorthAsOf(series, new Date(`${from}T00:00:00Z`))
    const endNw = netWorthAsOf(series, new Date(`${to}T00:00:00Z`))
    const observedDelta = startNw === null || endNw === null ? null : endNw - startNw
    return {
      cycleKey,
      inferred,
      observedDelta,
      gap: observedDelta === null ? null : inferred - observedDelta,
    }
  })
}

/**
 * Load the Household's per-cycle Savings gap. `null` when there is no Savings goal (the per-cycle
 * inferred-saving figures only exist with one), no balance history, or no completed cycle we can
 * actually compare. Reuses the savings snapshot's completed cycles unchanged (ADR-0023).
 */
export async function loadSavingsGap(
  repo: HouseholdRepo,
  now: Date
): Promise<SavingsGapCycle[] | null> {
  const [snapshot, series] = await Promise.all([
    loadSavingsSnapshot(repo, now),
    loadNetWorthSeries(repo),
  ])
  if (!snapshot || series.length === 0) return null

  const completed = snapshot.cycles
    .filter((cycle) => !cycle.inProgress)
    .map((cycle) => ({ cycleKey: cycle.cycleKey, inferred: cycle.inferredSaving }))
  if (completed.length === 0) return null

  const gaps = computeSavingsGap(completed, series)
  // Only worth surfacing if at least one cycle is actually comparable (has a baseline).
  return gaps.some((gap) => gap.observedDelta !== null) ? gaps : null
}
