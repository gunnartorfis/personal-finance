import Papa from "papaparse";

import { detectColumnMapping, type ColumnMapping } from "./column-mapping";

/**
 * Parse an Icelandic bank-statement CSV (ADR-0003) from decoded text — the web ingestion path
 * (the legacy `shared/parse.ts` reads a file path). Columns are matched by header name; rows whose
 * first field isn't a `DD.MM.YYYY` date (separators, blanks) are skipped. `sourceRow` is the data
 * row's index, kept for traceability.
 */

export interface ParsedRow {
  /** Source CSV data-row index (0-based), for traceability. */
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

/** Emit ParsedRows from already-parsed CSV cells using a resolved column mapping. */
function rowsToParsed(rows: string[][], mapping: ColumnMapping): ParsedRow[] {
  const { date: iDate, amount: iAmt, merchant: iMerch, category: iCat } = mapping;

  const out: ParsedRow[] = [];
  rows.slice(1).forEach((r, idx) => {
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

export function parseStatementCsv(text: string): ParsedRow[] {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
  if (rows.length === 0) return [];

  const header = rows[0];
  // Auto-detect the date/amount/merchant/category columns from arbitrary header names/orders (#96);
  // the foreign-currency amount column is excluded by the detector.
  const { resolved, unmatched } = detectColumnMapping(header);
  if (unmatched.length > 0) {
    throw new Error(`missing required columns: ${unmatched.join(", ")} (header: ${header.join(", ")})`);
  }
  return rowsToParsed(rows, resolved as ColumnMapping);
}
