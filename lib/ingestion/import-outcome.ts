import type { ColumnMapping } from "./column-mapping";
import type { WithheldReason, WithheldRow } from "./parse-csv";

/**
 * Turn the parser's {@link WithheldRow}s into the shape the commit response reports (ADR-0025): the
 * correctable "couldn't read" rows (bad date / bad amount) mapped to their role-labelled raw values,
 * a count of the ignored non-data lines, and a flag for a systematic failure (most rows failing the
 * same way — e.g. a whole file in an unsupported date format) so the UI can steer the Member toward
 * re-exporting rather than hand-fixing hundreds of rows.
 */

/** Default cap on individually-listed couldn't-read rows; the rest are reported only as a count. */
const COULDNT_READ_CAP = 50;

/** At least this many correctable rows, this dominated by one reason ⇒ a systematic failure. */
const SYSTEMATIC_MIN = 10;
const SYSTEMATIC_SHARE = 0.8;

/** A withheld row worth offering for repair — never `non-data` (that is only counted as ignored). */
export type CouldntReadReason = Exclude<WithheldReason, "non-data">;

/** A couldn't-read row, its raw cells mapped to the roles so the UI can show and (later) edit them. */
export interface CouldntReadRow {
  sourceRow: number;
  reason: CouldntReadReason;
  date: string;
  amount: string;
  merchant: string;
  category: string;
}

export interface WithheldSummary {
  /** Correctable rows, capped; `couldntReadTotal` is the true count before the cap. */
  couldntRead: CouldntReadRow[];
  couldntReadTotal: number;
  /** Non-data lines (blank, separator, footer) — counted only, never offered for repair. */
  ignoredCount: number;
  /** True when the correctable rows are numerous and mostly the same failure. */
  systematic: boolean;
}

function topReasonShare(rows: readonly WithheldRow[]): number {
  if (rows.length === 0) return 0;
  const counts = new Map<WithheldReason, number>();
  for (const r of rows) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return Math.max(...counts.values()) / rows.length;
}

export function summarizeWithheld(
  withheld: readonly WithheldRow[],
  mapping: ColumnMapping,
  cap: number = COULDNT_READ_CAP,
): WithheldSummary {
  const correctable = withheld.filter((w) => w.reason !== "non-data");
  const couldntRead: CouldntReadRow[] = correctable.slice(0, cap).map((w) => ({
    sourceRow: w.sourceRow,
    reason: w.reason as CouldntReadReason,
    date: w.cells[mapping.date] ?? "",
    amount: w.cells[mapping.amount] ?? "",
    merchant: w.cells[mapping.merchant] ?? "",
    category: w.cells[mapping.category] ?? "",
  }));
  return {
    couldntRead,
    couldntReadTotal: correctable.length,
    ignoredCount: withheld.length - correctable.length,
    systematic: correctable.length >= SYSTEMATIC_MIN && topReasonShare(correctable) >= SYSTEMATIC_SHARE,
  };
}
