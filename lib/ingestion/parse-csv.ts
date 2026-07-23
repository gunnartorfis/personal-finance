import Papa from "papaparse";

import { findHeaderRow, type ColumnMapping, type ColumnRole } from "./column-mapping";

/**
 * Parse an Icelandic bank-statement CSV (ADR-0003) from decoded text — the web ingestion path
 * (the legacy `shared/parse.ts` reads a file path). Columns are matched by header name; rows whose
 * first field isn't a `DD.MM.YYYY` date (separators, blanks) are skipped. `sourceRow` is the data
 * row's index, kept for traceability.
 */

export interface ParsedRow {
  /**
   * Ordinal of this row within the statement's data section (0-based), counted from the first row
   * after the detected header — kept for traceability. Not an absolute CSV line number: when
   * preamble/header rows precede the data, those are excluded from the count.
   */
  sourceRow: number;
  /** YYYY-MM-DD. */
  date: string;
  /** Charged amount in the Account's billing currency; negative = expense. */
  amount: number;
  merchant: string;
  /** The merchant-supplied category from the statement. */
  rawCategory: string;
}

/** Why an Upload row could not be turned into a {@link ParsedRow} (ADR-0025). */
export type WithheldReason = "bad-date" | "bad-amount" | "non-data";

/**
 * A row the parser did not emit, retained (ADR-0025) rather than silently dropped so the import
 * can report it. A `bad-date`/`bad-amount` row looks like a real transaction the deterministic
 * parser couldn't read (offered for repair); a `non-data` row — a blank line, separator, or
 * statement footer — is only counted as ignored, never offered for repair.
 */
export interface WithheldRow {
  /** Ordinal within the data section (0-based, after the header) — matches {@link ParsedRow.sourceRow}. */
  sourceRow: number;
  reason: WithheldReason;
  /** The row's raw cells as parsed, so the caller can display and (later) repair them. */
  cells: string[];
}

/**
 * Cap on emitted data rows. A year of daily card use is <2k rows; 20k is generous headroom, and
 * bounding here keeps one pathological upload from spiking memory/DB in a single insert.
 */
export const MAX_ROWS = 20_000;

/**
 * Thrown when a file's data rows exceed {@link MAX_ROWS}. A distinct type (rather than a bare Error)
 * so callers can tell "too big" apart from "unparseable" and report it accurately instead of a
 * generic parse failure.
 */
export class RowCapExceededError extends Error {
  constructor(readonly count: number) {
    super(`too many rows: ${count} exceeds the ${MAX_ROWS} cap`);
    this.name = "RowCapExceededError";
  }
}

/**
 * Cap on the free-text `merchant`/`rawCategory` cells. Truncated, not rejected — a legit statement
 * row with an absurd cell should still import — and it also bounds what later flows into the
 * classification prompt (cost-abuse defense; the classifier re-clamps independently).
 */
const MAX_FIELD_LENGTH = 200;

/** "-2.979 kr." -> -2979 ; "100.000 kr." -> 100000 ; null if unparsable. */
function parseAmount(s: string): number | null {
  const c = s.replace("kr.", "").replace(/\./g, "").replace(/\s/g, "").trim();
  return /^-?\d+$/.test(c) ? parseInt(c, 10) : null;
}

/**
 * Emit ParsedRows from already-parsed CSV cells using a resolved column mapping. Rows up to and
 * including `headerIndex` (the header and any preamble above it) are skipped; `sourceRow` counts
 * from the first data row after the header. Rows that don't parse are not dropped but returned as
 * `withheld` with a reason (ADR-0025) so the import can report them.
 */
function rowsToParsed(
  rows: string[][],
  mapping: ColumnMapping,
  headerIndex = 0,
): { rows: ParsedRow[]; withheld: WithheldRow[] } {
  const { date: iDate, amount: iAmt, merchant: iMerch, category: iCat } = mapping;

  const out: ParsedRow[] = [];
  const withheld: WithheldRow[] = [];
  rows.slice(headerIndex + 1).forEach((r, idx) => {
    const d = (r[iDate] ?? "").trim();
    const dateOk = d.length >= 10 && d[2] === ".";
    const amount = parseAmount(r[iAmt] ?? "");
    if (dateOk && amount !== null) {
      const date = `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;
      out.push({
        sourceRow: idx,
        date,
        amount,
        merchant: (r[iMerch] ?? "").trim().slice(0, MAX_FIELD_LENGTH),
        rawCategory: (r[iCat] ?? "").trim().slice(0, MAX_FIELD_LENGTH),
      });
      return;
    }
    // A row with fewer than two populated cells is structural noise (blank line, separator,
    // statement footer) — counted as ignored, never offered for repair. Otherwise the row looks
    // real: name the cell we couldn't read so it can be corrected.
    const populated = r.filter((c) => (c ?? "").trim() !== "").length;
    const reason: WithheldReason =
      populated < 2 ? "non-data" : !dateOk ? "bad-date" : "bad-amount";
    withheld.push({ sourceRow: idx, reason, cells: r });
  });
  if (out.length > MAX_ROWS) {
    throw new RowCapExceededError(out.length);
  }
  return { rows: out, withheld };
}

/**
 * Parse a statement CSV with an explicit, caller-supplied column mapping, also returning the header
 * row — so a caller that needs the header (e.g. to compute a signature) needn't parse a second time.
 *
 * Expects a header-bearing CSV: the first row is treated as the header and skipped (the mapping's
 * indices point at columns in that header). This matches the commit path, which re-sends the same
 * header-bearing file the preview parsed. A headerless CSV would silently drop its first data row.
 */
export function parseWithMappingAndHeader(
  text: string,
  mapping: ColumnMapping,
): { rows: ParsedRow[]; header: string[]; withheld: WithheldRow[] } {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
  if (rows.length === 0) return { rows: [], header: [], withheld: [] };
  const { rows: parsed, withheld } = rowsToParsed(rows, mapping);
  return { rows: parsed, header: rows[0] ?? [], withheld };
}

/**
 * Parse a statement CSV with an explicit, caller-supplied column mapping — the deterministic core
 * used both by auto-detection here and (ADR-0018) by the commit path once a mapping is confirmed.
 */
export function parseWithMapping(text: string, mapping: ColumnMapping): ParsedRow[] {
  return parseWithMappingAndHeader(text, mapping).rows;
}

/** The outcome of attempting to auto-detect and parse a statement CSV without throwing (ADR-0018). */
export interface ParseAttempt {
  /** Index of the detected header row (0 when no full header was found). */
  headerIndex: number;
  /** The detected header row's cells (empty for an empty file), e.g. for error messages. */
  header: string[];
  /** Roles that resolved to a column. */
  detectedMapping: Partial<ColumnMapping>;
  /** Required roles with no matching column; empty when the mapping is complete. */
  unmatchedRoles: ColumnRole[];
  /** Parsed data rows — populated only when `unmatchedRoles` is empty, otherwise `[]`. */
  rows: ParsedRow[];
  /** Rows that couldn't be parsed, retained with a reason (ADR-0025); `[]` when the mapping is incomplete. */
  withheld: WithheldRow[];
  /** A few raw data rows after the header (for the AI-fallback prompt); empty when there are none. */
  sampleRows: string[][];
}

/** How many data rows to keep as samples for the AI-fallback prompt. */
const SAMPLE_ROW_COUNT = 5;

/**
 * Auto-detect the header + column mapping and, if complete, parse the data rows — without throwing
 * on an unmappable file (a `RowCapExceededError` for an oversized file still propagates). The
 * preview path (ADR-0018) uses this so an unmappable file yields `unmatchedRoles` for the UI rather
 * than an error. `parseStatementCsv` is the throwing wrapper used by the direct commit path.
 */
export function attemptParse(text: string): ParseAttempt {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
  if (rows.length === 0) {
    return {
      headerIndex: 0,
      header: [],
      detectedMapping: {},
      unmatchedRoles: [],
      rows: [],
      withheld: [],
      sampleRows: [],
    };
  }
  // Locate the header row first (bank exports often carry preamble lines — account no., statement
  // period, blanks — above it); findHeaderRow also returns the auto-detected date/amount/merchant/
  // category mapping for that row (#96), so we don't detect twice.
  const {
    index: headerIndex,
    mapping: { resolved, unmatched },
  } = findHeaderRow(rows);
  const parsed =
    unmatched.length === 0
      ? rowsToParsed(rows, resolved as ColumnMapping, headerIndex)
      : { rows: [] as ParsedRow[], withheld: [] as WithheldRow[] };
  return {
    headerIndex,
    header: rows[headerIndex] ?? [],
    detectedMapping: resolved,
    unmatchedRoles: unmatched,
    rows: parsed.rows,
    withheld: parsed.withheld,
    sampleRows: rows.slice(headerIndex + 1, headerIndex + 1 + SAMPLE_ROW_COUNT),
  };
}

export function parseStatementCsv(text: string): ParsedRow[] {
  const { header, unmatchedRoles, rows } = attemptParse(text);
  if (unmatchedRoles.length > 0) {
    throw new Error(
      `missing required columns: ${unmatchedRoles.join(", ")} (header: ${header.join(", ")})`,
    );
  }
  return rows;
}
