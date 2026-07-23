/**
 * Effective-dated income & off-card-cost resolution for a Household's savings math (ADR-0015).
 *
 * ADR-0007 modelled Monthly income and Off-card fixed costs as one flat figure each, applied to
 * every Statement cycle. That is wrong the moment either changes over time (a raise, a rent hike, a
 * cleared loan). Here each recurring source carries a timeline of dated amounts, and a cycle may
 * also carry non-recurring one-off adjustments; this module resolves, per cycle, the effective
 * `monthlyIncome` and `offCardFixed` the downstream savings math (`shared/savings.ts`) consumes.
 *
 * Pure and self-contained so it can be unit-tested directly — no database or `lib/` wiring. Two
 * caller preconditions, both enforced upstream (DB CHECK + input validation in later ADR-0015
 * slices), not re-checked here:
 *   - cycle keys are well-formed fixed-width `YYYY-MM`, so "in force at cycle" is a lexicographic
 *     `<=` compare;
 *   - every amount is a non-negative whole billing-currency unit (0 is the floor — it ends a
 *     source; a negative would silently drive `monthlyIncome`/`offCardFixed` below zero).
 */

/** A Statement-cycle key, `YYYY-MM`. Compared lexicographically (valid because the width is fixed). */
export type CycleKey = string;

/**
 * Group recurring-source rows into per-source timelines for {@link resolveCycleAmounts} (ADR-0015):
 * rows sharing a `name` are versions of ONE source (only the latest in force at a cycle counts),
 * while distinct names are separate sources (summed). `amountOf` reads the row's amount column
 * (income sources carry `amount`, off-card costs carry `monthlyAmount`), so one helper serves both.
 */
export function timelinesByName<T extends { name: string; effectiveFrom: CycleKey }>(
  rows: readonly T[],
  amountOf: (row: T) => number,
): EffectiveAmount[][] {
  const byName = new Map<string, EffectiveAmount[]>();
  for (const row of rows) {
    const version = { amount: amountOf(row), effectiveFrom: row.effectiveFrom };
    const existing = byName.get(row.name);
    if (existing) existing.push(version);
    else byName.set(row.name, [version]);
  }
  return [...byName.values()];
}

/**
 * Each named recurring source's amount in force at `cycle` (ADR-0015), in first-seen order, dropping
 * any source resolving to 0 (not started yet, or stepped to 0 — a cleared loan / ended job). Rows
 * sharing a `name` are versions of one source; `amountOf` reads the amount column (income sources
 * carry `amount`, off-card costs `monthlyAmount`). For the itemized configured-amounts view, where a
 * surface lists each source by name rather than just the per-side total {@link resolveCycleAmounts} gives.
 */
export function inForceByName<T extends { name: string; effectiveFrom: CycleKey }>(
  rows: readonly T[],
  amountOf: (row: T) => number,
  cycle: CycleKey,
): Array<{ name: string; amount: number }> {
  const byName = new Map<string, EffectiveAmount[]>();
  for (const row of rows) {
    const version = { amount: amountOf(row), effectiveFrom: row.effectiveFrom };
    const existing = byName.get(row.name);
    if (existing) existing.push(version);
    else byName.set(row.name, [version]);
  }
  const inForce: Array<{ name: string; amount: number }> = [];
  for (const [name, versions] of byName) {
    const amount = amountInForce(versions, cycle);
    if (amount > 0) inForce.push({ name, amount });
  }
  return inForce;
}

/** One dated amount in a recurring source's timeline: the amount in force from `effectiveFrom` on. */
export interface EffectiveAmount {
  /** Non-negative whole billing-currency units; 0 ends a source (a job stops, a loan is cleared). */
  amount: number;
  /** The Statement cycle this amount takes effect from, until a later version supersedes it. */
  effectiveFrom: CycleKey;
}

/** A non-recurring, single-cycle adjustment — a bonus/refund (income) or a one-time bill (cost). */
export interface OneOffAdjustment {
  cycleKey: CycleKey;
  /** Non-negative whole billing-currency units, added to that cycle's recurring base. */
  amount: number;
}

/**
 * A Household's recurring income/cost timelines and one-off adjustments. Each recurring *source*
 * (a salary, a rental, a rent, a loan) is its own array of {@link EffectiveAmount} versions, so
 * sources change independently; one-offs are flat lists keyed by cycle.
 */
export interface TimelineInput {
  incomeSources: ReadonlyArray<ReadonlyArray<EffectiveAmount>>;
  offcardCostSources: ReadonlyArray<ReadonlyArray<EffectiveAmount>>;
  incomeOneOffs: ReadonlyArray<OneOffAdjustment>;
  costOneOffs: ReadonlyArray<OneOffAdjustment>;
}

/** The resolved recurring-plus-one-off amounts for a single Statement cycle. */
export interface CycleAmounts {
  monthlyIncome: number;
  offCardFixed: number;
}

/**
 * The amount of a single source in force at `cycle`: the latest version whose `effectiveFrom` is at
 * or before `cycle`. 0 when the source has no version yet at that cycle (it starts later, or has
 * none at all) — an absent source contributes nothing, never a negative.
 */
export function amountInForce(
  versions: ReadonlyArray<EffectiveAmount>,
  cycle: CycleKey,
): number {
  let inForce = 0;
  let bestFrom: CycleKey | null = null;
  for (const version of versions) {
    if (version.effectiveFrom > cycle) continue;
    if (bestFrom === null || version.effectiveFrom > bestFrom) {
      bestFrom = version.effectiveFrom;
      inForce = version.amount;
    }
  }
  return inForce;
}

/** Sum the one-off adjustments that land on `cycle`. */
function oneOffTotal(oneOffs: ReadonlyArray<OneOffAdjustment>, cycle: CycleKey): number {
  let total = 0;
  for (const oneOff of oneOffs) {
    if (oneOff.cycleKey === cycle) total += oneOff.amount;
  }
  return total;
}

/** Sum every source's in-force amount at `cycle`. */
function totalInForce(
  sources: ReadonlyArray<ReadonlyArray<EffectiveAmount>>,
  cycle: CycleKey,
): number {
  let total = 0;
  for (const versions of sources) total += amountInForce(versions, cycle);
  return total;
}

/**
 * Resolve each of `cycleKeys` to its effective `monthlyIncome` and `offCardFixed`: every source's
 * in-force version summed, plus that cycle's one-off adjustments. Returns a Map keyed by cycle so
 * callers can look up a cycle directly; cycles absent from any timeline resolve to zeros.
 */
export function resolveCycleAmounts(
  input: TimelineInput,
  cycleKeys: ReadonlyArray<CycleKey>,
): Map<CycleKey, CycleAmounts> {
  const resolved = new Map<CycleKey, CycleAmounts>();
  for (const cycle of cycleKeys) {
    resolved.set(cycle, {
      monthlyIncome: totalInForce(input.incomeSources, cycle) + oneOffTotal(input.incomeOneOffs, cycle),
      offCardFixed:
        totalInForce(input.offcardCostSources, cycle) + oneOffTotal(input.costOneOffs, cycle),
    });
  }
  return resolved;
}
