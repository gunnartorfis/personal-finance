/**
 * Map a transaction date (YYYY-MM-DD) to its credit-card billing period.
 * The statement cycle runs from the 27th of one month through the 26th of the
 * next, and is labeled by its closing (later) month — e.g. Mar 27–Apr 26 → "2026-04".
 */
export function billingMonth(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  if (d >= 27) {
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return `${ny}-${String(nm).padStart(2, "0")}`;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}
