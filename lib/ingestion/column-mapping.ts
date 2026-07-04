/**
 * Auto-detect which CSV columns hold the date / amount / merchant / category, so imports accept
 * varied bank-statement header names and orders instead of a fixed set (#96). Header labels are
 * diacritic-folded and tokenized, then matched against per-role alias sets; the foreign-currency
 * amount column ("Upphæð í erlendum gjaldmiðli") is deliberately not matched as the amount.
 */

export type ColumnRole = "date" | "amount" | "merchant" | "category";

/** The resolved 0-based column index for each required role. */
export type ColumnMapping = Record<ColumnRole, number>;

const DIACRITICS: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ý: "y", ð: "d", þ: "th", æ: "ae", ö: "o",
};

/** Lower-case, fold Icelandic diacritics, and split into alphanumeric tokens. */
function tokenize(label: string): string[] {
  const folded = label
    .toLowerCase()
    .replace(/[áéíóúýðþæö]/g, (ch) => DIACRITICS[ch] ?? ch);
  return folded.split(/[^a-z0-9]+/).filter(Boolean);
}

const ALIASES: Record<ColumnRole, string[]> = {
  date: ["date", "dagsetning", "dags", "bokunardagur", "bokunardagsetning", "faersludagur", "bookingdate", "transactiondate", "valuedate"],
  amount: ["amount", "upphaed", "fjarhaed", "belag"],
  merchant: ["merchant", "motadili", "lysing", "description", "desc", "text", "skyring", "payee", "seller", "nafn", "name", "verslun"],
  category: ["category", "tegund", "flokkur", "type"],
};

/** Tokens that mark a foreign-currency amount column, which must never map to the ISK amount. */
const FOREIGN_MARKERS = ["erlend", "erlendum", "erlendri", "foreign", "gjaldmidli", "gjaldmidill", "currency", "fx"];

function labelMatchesRole(label: string, role: ColumnRole): boolean {
  const tokens = tokenize(label);
  if (role === "amount" && tokens.some((t) => FOREIGN_MARKERS.includes(t))) return false;
  const aliases = ALIASES[role];
  // Whole-label match (e.g. "transactiondate") or any single token equal to an alias.
  return aliases.includes(tokens.join("")) || tokens.some((t) => aliases.includes(t));
}

/**
 * Resolve each required role to a column index by alias/token matching, left-to-right, consuming
 * each column at most once. Returns `null` if any role has no matching column (the caller reports
 * the unmapped header). Roles are resolved in a fixed order; alias sets are disjoint across roles.
 */
export function detectColumnMapping(header: ReadonlyArray<string>): ColumnMapping | null {
  const used = new Set<number>();
  const mapping: Partial<ColumnMapping> = {};

  for (const role of ["date", "amount", "merchant", "category"] as const) {
    const index = header.findIndex((label, i) => !used.has(i) && labelMatchesRole(label, role));
    if (index === -1) return null;
    used.add(index);
    mapping[role] = index;
  }

  return mapping as ColumnMapping;
}
