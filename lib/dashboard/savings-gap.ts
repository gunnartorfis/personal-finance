import type { SavingsSnapshot } from "@/lib/savings/assessment"

import { cycleKeyRange } from "./cycle"
import type { NetWorthPoint } from "./net-worth"

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

/** The latest snapshot at or before `date` (the step-function value), or `null` when none exists. */
function pointAsOf(series: ReadonlyArray<NetWorthPoint>, date: Date): NetWorthPoint | null {
  let point: NetWorthPoint | null = null
  for (const candidate of series) {
    if (candidate.asOf.getTime() <= date.getTime()) point = candidate
    else break // oldest-first
  }
  return point
}

/**
 * Compare inferred saving against the observed net-worth change for each given cycle. A cycle is only
 * comparable when BOTH a balance baseline exists at or before its start AND a *newer* snapshot lands
 * by its end — i.e. the value was actually re-observed during the cycle. Without a fresh reading the
 * carried-forward balance is unchanged, which is "unobserved", not a real zero change; such a cycle
 * reports `observedDelta` / `gap` as `null`, surfaced as a caveat rather than a misleading number.
 * Pure so it unit-tests directly.
 */
export function computeSavingsGap(
  cycles: ReadonlyArray<{ cycleKey: string; inferred: number }>,
  series: ReadonlyArray<NetWorthPoint>
): SavingsGapCycle[] {
  return cycles.map(({ cycleKey, inferred }) => {
    const { from, to } = cycleKeyRange(cycleKey)
    const start = pointAsOf(series, new Date(`${from}T00:00:00Z`))
    const end = pointAsOf(series, new Date(`${to}T00:00:00Z`))
    const covered = start !== null && end !== null && end.asOf.getTime() > start.asOf.getTime()
    const observedDelta = covered ? end!.total - start!.total : null
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
/**
 * Build the per-cycle Savings gap from an already-loaded Savings snapshot and net-worth series —
 * PURE (no queries): the dashboard loads the snapshot once (it also feeds the progress card) and the
 * series once, so neither is fetched twice and `deriveCycles` runs only once per render. `null` when
 * there is no Savings goal (no snapshot, hence no per-cycle inferred saving), no balance history, or
 * no comparable completed cycle. Reuses the snapshot's inferred figures UNCHANGED (ADR-0023
 * compare-never-merge; `lib/savings/*` untouched).
 */
export function buildSavingsGap(
  snapshot: SavingsSnapshot | null,
  series: ReadonlyArray<NetWorthPoint>
): SavingsGapCycle[] | null {
  if (!snapshot || series.length === 0) return null

  const completed = snapshot.cycles
    .filter((cycle) => !cycle.inProgress)
    .map((cycle) => ({ cycleKey: cycle.cycleKey, inferred: cycle.inferredSaving }))
  if (completed.length === 0) return null

  const gaps = computeSavingsGap(completed, series)
  // Only worth surfacing if at least one cycle is actually comparable (has a baseline).
  return gaps.some((gap) => gap.observedDelta !== null) ? gaps : null
}
