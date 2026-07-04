import Papa from "papaparse";

import { detectColumnMapping } from "./column-mapping";

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

/** "-2.979 kr." -> -2979 ; "100.000 kr." -> 100000 ; null if unparsable. */
function parseAmount(s: string): number | null {
  const c = s.replace("kr.", "").replace(/\./g, "").replace(/\s/g, "").trim();
  return /^-?\d+$/.test(c) ? parseInt(c, 10) : null;
}

export function parseStatementCsv(text: string): ParsedRow[] {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
  if (rows.length === 0) return [];

  const header = rows[0];
  // Auto-detect the date/amount/merchant/category columns from arbitrary header names/orders (#96);
  // the foreign-currency amount column is excluded by the detector.
  const mapping = detectColumnMapping(header);
  if (!mapping) {
    throw new Error(`missing required columns in header: ${header.join(", ")}`);
  }
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
      merchant: (r[iMerch] ?? "").trim(),
      rawCategory: (r[iCat] ?? "").trim(),
    });
  });
  return out;
}
