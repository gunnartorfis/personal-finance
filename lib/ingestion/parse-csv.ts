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

/**
 * Cap on emitted data rows. A year of daily card use is <2k rows; 20k is generous headroom, and
 * bounding here keeps one pathological upload from spiking memory/DB in a single insert. Thrown (like
 * the missing-columns case) so the upload route's existing catch maps it to 422.
 */
const MAX_ROWS = 20_000;

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
 * from the first data row after the header.
 */
function rowsToParsed(rows: string[][], mapping: ColumnMapping, headerIndex = 0): ParsedRow[] {
  const { date: iDate, amount: iAmt, merchant: iMerch, category: iCat } = mapping;

  const out: ParsedRow[] = [];
  rows.slice(headerIndex + 1).forEach((r, idx) => {
    const d = (r[iDate] ?? "").trim();
    if (d.length < 10 || d[2] !== ".") return; // skip non-date / separator rows
    const amount = parseAmount(r[iAmt] ?? "");
    if (amount === null) return;
    const date = `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;
    out.push({
      sourceRow: idx,
      date,
      amount,
      merchant: (r[iMerch] ?? "").trim().slice(0, MAX_FIELD_LENGTH),
      rawCategory: (r[iCat] ?? "").trim().slice(0, MAX_FIELD_LENGTH),
    });
  });
  if (out.length > MAX_ROWS) {
    throw new Error(`too many rows: ${out.length} exceeds the ${MAX_ROWS} cap`);
  }
  return out;
}

/**
 * Parse a statement CSV with an explicit, caller-supplied column mapping — the deterministic core
 * used both by auto-detection here and (ADR-0018) by the commit path once a mapping is confirmed.
 *
 * Expects a header-bearing CSV: the first row is treated as the header and skipped (the mapping's
 * indices point at columns in that header). This matches the commit path, which re-sends the same
 * header-bearing file the preview parsed. A headerless CSV would silently drop its first data row.
 */
export function parseWithMapping(text: string, mapping: ColumnMapping): ParsedRow[] {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
  if (rows.length === 0) return [];
  return rowsToParsed(rows, mapping);
}

/** The outcome of attempting to auto-detect and parse a statement CSV without throwing (ADR-0018). */
export interface ParseAttempt {
  /** Index of the detected header row (0 when no full header was found). */
  headerIndex: number;
  /** Roles that resolved to a column. */
  detectedMapping: Partial<ColumnMapping>;
  /** Required roles with no matching column; empty when the mapping is complete. */
  unmatchedRoles: ColumnRole[];
  /** Parsed data rows — populated only when `unmatchedRoles` is empty, otherwise `[]`. */
  rows: ParsedRow[];
}

/**
 * Auto-detect the header + column mapping and, if complete, parse the data rows — without throwing.
 * The preview path (ADR-0018) uses this so an unmappable file yields `unmatchedRoles` for the UI
 * rather than an error. `parseStatementCsv` is the throwing wrapper used by the direct commit path.
 */
export function attemptParse(text: string): ParseAttempt {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
  if (rows.length === 0) {
    return { headerIndex: 0, detectedMapping: {}, unmatchedRoles: [], rows: [] };
  }
  // Locate the header row first (bank exports often carry preamble lines — account no., statement
  // period, blanks — above it); findHeaderRow also returns the auto-detected date/amount/merchant/
  // category mapping for that row (#96), so we don't detect twice.
  const {
    index: headerIndex,
    mapping: { resolved, unmatched },
  } = findHeaderRow(rows);
  const parsed =
    unmatched.length === 0 ? rowsToParsed(rows, resolved as ColumnMapping, headerIndex) : [];
  return { headerIndex, detectedMapping: resolved, unmatchedRoles: unmatched, rows: parsed };
}

export function parseStatementCsv(text: string): ParsedRow[] {
  const { headerIndex, unmatchedRoles, rows } = attemptParse(text);
  if (unmatchedRoles.length > 0) {
    // Re-parse just the header cells for the message; cheap and keeps attemptParse allocation-free.
    const header = Papa.parse<string[]>(text, { skipEmptyLines: false }).data[headerIndex] ?? [];
    throw new Error(
      `missing required columns: ${unmatchedRoles.join(", ")} (header: ${header.join(", ")})`,
    );
  }
  return rows;
}
