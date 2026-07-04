/**
 * Auto-detect which CSV columns hold the date / amount / merchant / category, so imports accept
 * varied bank-statement header names and orders instead of a fixed set (#96). Header labels are
 * diacritic-folded and tokenized, then matched against per-role alias sets; the foreign-currency
 * amount column ("Upphæð í erlendum gjaldmiðli") is deliberately not matched as the amount.
 */

export type ColumnRole = "date" | "amount" | "merchant" | "category";

/** The resolved 0-based column index for each required role. */
export type ColumnMapping = Record<ColumnRole, number>;

/**
 * The outcome of a detection pass: the roles that resolved to a column, and the roles that had no
 * matching column. A complete mapping has `unmatched` empty; a partial one names the gaps so the
 * preview / AI-fallback layers (ADR-0018) know exactly what a human or the model must still supply.
 */
export interface ColumnMappingResult {
  resolved: Partial<ColumnMapping>;
  unmatched: ColumnRole[];
}

/** Roles resolved in this fixed order; alias sets are disjoint across roles. */
const ROLES = ["date", "amount", "merchant", "category"] as const;

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
  // Deliberately specific: generic tokens like "name"/"text" are omitted — left-to-right resolution
  // would let "Account Name" / "Reference Text" greedily claim the merchant role before the real
  // column, so they'd do more harm than good.
  merchant: ["merchant", "motadili", "lysing", "description", "skyring", "payee", "seller", "verslun"],
  category: ["category", "tegund", "flokkur", "type"],
};

/** Tokens that mark a foreign-currency amount column, which must never map to the ISK amount. */
const FOREIGN_MARKERS = ["erlend", "erlendum", "erlendri", "foreign", "gjaldmidli", "gjaldmidill", "currency", "fx"];

function labelMatchesRole(label: string, role: ColumnRole): boolean {
  const tokens = tokenize(label);
  if (role === "amount" && tokens.some((t) => FOREIGN_MARKERS.includes(t))) return false;
  const aliases = ALIASES[role];
  // A single token equal to an alias. Multi-word headers ("Booking Date") match on their component
  // token ("date"); we don't concatenate tokens, which would accidentally match split labels.
  return tokens.some((t) => aliases.includes(t));
}

/**
 * Resolve each required role to a column index by alias/token matching, left-to-right, consuming
 * each column at most once. Never fails: a role with no matching column is reported in `unmatched`
 * (in role order) rather than aborting, so a partial header still yields what it can.
 */
export function detectColumnMapping(header: ReadonlyArray<string>): ColumnMappingResult {
  const used = new Set<number>();
  const resolved: Partial<ColumnMapping> = {};
  const unmatched: ColumnRole[] = [];

  for (const role of ROLES) {
    const index = header.findIndex((label, i) => !used.has(i) && labelMatchesRole(label, role));
    if (index === -1) {
      unmatched.push(role);
      continue;
    }
    used.add(index);
    resolved[role] = index;
  }

  return { resolved, unmatched };
}
