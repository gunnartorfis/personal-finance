/**
 * Statement-cycle boundaries for the dashboard (Phase F). A cycle is the calendar month containing
 * `now`. Computed in UTC so it matches the date-only `transactions.date` column without timezone
 * drift, and returned as a half-open ISO date range `[from, to)` for {@link loadNetSummary}.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The `[from, to)` ISO date range (`YYYY-MM-DD`) of the calendar month containing `now`. */
export function cycleRange(now: Date): { from: string; to: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11
  const from = `${year}-${pad(month + 1)}-01`;
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const to = `${nextYear}-${pad(nextMonth + 1)}-01`;
  return { from, to };
}

/** A human label for the cycle, e.g. `"March 2026"`. */
export function cycleLabel(now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(now);
}
