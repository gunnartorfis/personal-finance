import { fingerprint, type FingerprintInput } from "@/shared/dedup";

import type { ColumnMapping } from "./column-mapping";
import type { WithheldReason, WithheldRow } from "./parse-csv";

/**
 * Turn the parser's {@link WithheldRow}s into the shape the commit response reports (ADR-0025): the
 * correctable "couldn't read" rows (bad date / bad amount) mapped to their role-labelled raw values,
 * a count of the ignored non-data lines, and a flag for a systematic failure (most rows failing the
 * same way — e.g. a whole file in an unsupported date format) so the UI can steer the Member toward
 * re-exporting rather than hand-fixing hundreds of rows.
 */

/** Default cap on individually-listed detail rows (couldn't-read / already-imported); rest are a count. */
const DETAIL_CAP = 50;

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
  cap: number = DETAIL_CAP,
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

/** A stored transaction reduced to its dedup fingerprint plus the provenance of its Upload. */
export interface StoredForProvenance extends FingerprintInput {
  /** ISO timestamp of the Upload the stored row came from; null for a bank-synced row. */
  importedAt: string | null;
  /** File name of that Upload; null for a bank-synced row. */
  fileName: string | null;
}

/** An already-imported (deduped) row shown to the Member, with when/where it first came in. */
export interface AlreadyImportedRow {
  sourceRow: number;
  date: string;
  amount: number;
  merchant: string;
  category: string;
  importedAt: string | null;
  fileName: string | null;
}

/** Earliest-imported row wins; a null timestamp sorts last so unknown provenance never masks a real one. */
function earliestProvenance(
  rows: readonly StoredForProvenance[],
): StoredForProvenance | undefined {
  return rows.reduce<StoredForProvenance | undefined>((best, row) => {
    if (!best) return row;
    return (row.importedAt ?? "￿") < (best.importedAt ?? "￿") ? row : best;
  }, undefined);
}

/**
 * Pair each duplicate (already-imported) incoming row with the provenance of the earliest stored
 * Upload that carries its fingerprint (ADR-0025), so the Member sees "already in since {date} ·
 * {file}" and can decide whether it is truly a re-import. Capped like the couldn't-read list.
 */
export function buildAlreadyImported(
  duplicates: ReadonlyArray<FingerprintInput & { sourceRow: number }>,
  stored: ReadonlyArray<StoredForProvenance>,
  cap: number = DETAIL_CAP,
): { alreadyImported: AlreadyImportedRow[]; alreadyImportedTotal: number } {
  const byFingerprint = new Map<string, StoredForProvenance[]>();
  for (const row of stored) {
    const fp = fingerprint(row);
    const bucket = byFingerprint.get(fp);
    if (bucket) bucket.push(row);
    else byFingerprint.set(fp, [row]);
  }

  const alreadyImported: AlreadyImportedRow[] = duplicates.slice(0, cap).map((d) => {
    const match = earliestProvenance(byFingerprint.get(fingerprint(d)) ?? []);
    return {
      sourceRow: d.sourceRow,
      date: d.date,
      amount: d.amount,
      merchant: d.merchant,
      category: d.category,
      importedAt: match?.importedAt ?? null,
      fileName: match?.fileName ?? null,
    };
  });
  return { alreadyImported, alreadyImportedTotal: duplicates.length };
}
