/**
 * Statement-cycle boundaries (Phase F/H). A cycle is one calendar month, identified by its
 * `YYYY-MM` key. All math is in UTC so it matches the date-only `transactions.date` column without
 * timezone drift; ranges are returned half-open `[from, to)` for {@link loadNetSummary} and the
 * transactions list. The dashboard works off "the month containing now"; the transactions view lets
 * the user pick any past cycle by key, so the key-based helpers are the primitive and the
 * `now`-based ones delegate to them.
 */

/** A statement cycle identified by its calendar month, e.g. `"2026-03"`. */
export type CycleKey = string;

const CYCLE_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Whether `key` is a well-formed cycle key (`YYYY-MM`, month 01–12). */
export function isValidCycleKey(key: string): key is CycleKey {
  return CYCLE_KEY_RE.test(key);
}

function parseKey(key: CycleKey): { year: number; month: number } {
  const match = CYCLE_KEY_RE.exec(key);
  if (!match) throw new Error(`invalid cycle key: ${key}`);
  return { year: Number(match[1]), month: Number(match[2]) }; // month 1-12
}

/** The cycle key for the calendar month containing `now`. */
export function currentCycleKey(now: Date): CycleKey {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
}

/** The `[from, to)` ISO date range (`YYYY-MM-DD`) of a cycle. */
export function cycleKeyRange(key: CycleKey): { from: string; to: string } {
  const { year, month } = parseKey(key);
  const from = `${year}-${pad(month)}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const to = `${nextYear}-${pad(nextMonth)}-01`;
  return { from, to };
}

/** A human label for a cycle, e.g. `"March 2026"`. */
export function cycleKeyLabel(key: CycleKey): string {
  const { year, month } = parseKey(key);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** A short month label for a cycle, e.g. `"Mar"` — the x-axis tick for the dashboard trend charts. */
export function shortCycleLabel(key: CycleKey): string {
  const { year, month } = parseKey(key);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** The key of the calendar month before `key`. */
export function previousCycleKey(key: CycleKey): CycleKey {
  const { year, month } = parseKey(key);
  return month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
}

/** The key of the calendar month after `key`. */
export function nextCycleKey(key: CycleKey): CycleKey {
  const { year, month } = parseKey(key);
  return month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
}

/**
 * The `count` most recent cycle keys ending at the month containing `now`, oldest first — the
 * dashboard's rolling look-back window (e.g. 12 months). A non-positive `count` yields `[]`.
 */
export function recentCycleKeys(now: Date, count: number): CycleKey[] {
  if (count <= 0) return [];
  const keys: CycleKey[] = [currentCycleKey(now)];
  while (keys.length < count) {
    keys.push(previousCycleKey(keys[keys.length - 1]));
  }
  return keys.reverse();
}

/** The `[from, to)` ISO date range (`YYYY-MM-DD`) of the calendar month containing `now`. */
export function cycleRange(now: Date): { from: string; to: string } {
  return cycleKeyRange(currentCycleKey(now));
}

/** A human label for the cycle containing `now`, e.g. `"March 2026"`. */
export function cycleLabel(now: Date): string {
  return cycleKeyLabel(currentCycleKey(now));
}
