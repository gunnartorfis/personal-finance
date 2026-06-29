/**
 * Statement-cycle bucketing (`CONTEXT.md` "Statement cycle").
 *
 * A Household's dashboard groups transactions into statement cycles defined by a configurable
 * cutoff day. The default cutoff is the 1st — a plain calendar month, labeled by that month. A
 * cutoff `C > 1` means the cycle runs from day `C` of one month through day `C-1` of the next and
 * is labeled by its closing (later) month — e.g. with cutoff 27, Mar 27–Apr 26 → "2026-04".
 *
 * `cutoffDay` is expected in 1..28 (every month has those days).
 */

/** Default statement-cycle cutoff day: the 1st, i.e. calendar months. */
export const DEFAULT_CUTOFF_DAY = 1;

/**
 * The statement cycle a transaction date (`YYYY-MM-DD`) falls into, as a `YYYY-MM` label.
 * With `cutoffDay` of 1 (the default) this is simply the date's calendar month.
 */
export function statementCycle(dateISO: string, cutoffDay: number = DEFAULT_CUTOFF_DAY): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  // For a cutoff after the 1st, dates on or after the cutoff belong to the next (closing) month.
  if (cutoffDay > 1 && d >= cutoffDay) {
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return `${ny}-${String(nm).padStart(2, "0")}`;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}
