import fs from "node:fs";
import Papa from "papaparse";
import { billingMonth } from "./billing.ts";

/** "-2.979 kr." -> -2979 ; "100.000 kr." -> 100000 ; null if unparsable. */
function parseAmount(s: string): number | null {
  const c = s.replace("kr.", "").replace(/\./g, "").replace(/\s/g, "").trim();
  return /^-?\d+$/.test(c) ? parseInt(c, 10) : null;
}

export interface RawRow {
  id: number; // source CSV data-row index (stable)
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  merchant: string;
  category: string;
  amount: number;
}

function colIndex(header: string[], names: string[]): number {
  // Map header label -> first column index for O(1) lookups (the loop below
  // would otherwise re-scan the header for every candidate name).
  const low = new Map<string, number>();
  header.forEach((h, i) => {
    const k = h.trim().toLowerCase();
    if (!low.has(k)) low.set(k, i);
  });
  for (const n of names) {
    const i = low.get(n.toLowerCase());
    if (i !== undefined) return i;
  }
  return -1;
}

/**
 * Parse an Icelandic bank-statement CSV. Any `Type` column is ignored — this
 * is the raw-input parser the classifier runs on. Rows whose first field is not
 * a DD.MM.YYYY date (separators, blanks) are skipped. `id` is the source data-row
 * index so it stays stable across re-classification.
 */
export function parseCsv(path: string): RawRow[] {
  const text = fs.readFileSync(path, "utf8");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const rows = parsed.data as string[][];
  if (rows.length === 0) throw new Error(`empty file: ${path}`);

  const header = rows[0];
  const iDate = colIndex(header, ["Dagsetning", "date"]);
  // Exact "Upphæð" matches the ISK column, not "Upphæð í erlendum gjaldmiðli".
  const iAmt = colIndex(header, ["Upphæð", "Upphaed", "amount"]);
  const iMerch = colIndex(header, ["Mótaðili", "Motadili", "merchant"]);
  const iCat = colIndex(header, ["Tegund", "category"]);
  if ([iDate, iAmt, iMerch, iCat].includes(-1)) {
    throw new Error(`missing required columns in header: ${header.join(", ")}`);
  }

  const out: RawRow[] = [];
  rows.slice(1).forEach((r, idx) => {
    const d = (r[iDate] ?? "").trim();
    if (d.length < 10 || d[2] !== ".") return; // skip non-date / separator rows
    const amount = parseAmount(r[iAmt] ?? "");
    if (amount === null) return;
    const dd = d.slice(0, 2);
    const mm = d.slice(3, 5);
    const yy = d.slice(6, 10);
    const date = `${yy}-${mm}-${dd}`;
    out.push({
      id: idx,
      date,
      month: billingMonth(date), // credit-card billing cycle, not calendar month
      merchant: (r[iMerch] ?? "").trim(),
      category: (r[iCat] ?? "").trim(),
      amount,
    });
  });
  return out;
}

/**
 * Read any existing `Type` column, keyed by the same row id as parseCsv (used by
 * the no-AI seed path). Returns an empty map if the CSV has no Type column.
 */
export function readExistingTypes(path: string): Map<number, string> {
  const text = fs.readFileSync(path, "utf8");
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data as string[][];
  const map = new Map<number, string>();
  if (rows.length === 0) return map;
  const iDate = colIndex(rows[0], ["Dagsetning", "date"]);
  const iType = colIndex(rows[0], ["Type"]);
  if (iType === -1 || iDate === -1) return map;
  rows.slice(1).forEach((r, idx) => {
    const d = (r[iDate] ?? "").trim();
    if (d.length < 10 || d[2] !== ".") return;
    map.set(idx, (r[iType] ?? "").trim());
  });
  return map;
}
