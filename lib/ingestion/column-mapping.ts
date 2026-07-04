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

/** Lower-case, fold Icelandic diacritics, trim, and collapse internal whitespace. */
function foldLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[áéíóúýðþæö]/g, (ch) => DIACRITICS[ch] ?? ch)
    .replace(/\s+/g, " ")
    .trim();
}

/** Lower-case, fold Icelandic diacritics, and split into alphanumeric tokens. */
function tokenize(label: string): string[] {
  return foldLabel(label).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * A normalized, order-independent signature of a file's header labels — the key under which a
 * Household's confirmed Column mapping is remembered (ADR-0018). Each label is diacritic-folded,
 * lower-cased and trimmed; blanks are dropped; the set is sorted. The same bank format always yields
 * the same signature regardless of column order or casing, while a changed column set yields a new
 * one (a changed export re-learns rather than mis-replaying an old mapping). Serialized with
 * `JSON.stringify` so it is unambiguous — a label containing any delimiter can't collide with a
 * different set of labels — and total: an empty/all-blank header yields `"[]"`, never `""`.
 */
export function headerSignature(header: ReadonlyArray<string>): string {
  const labels = header
    .map(foldLabel)
    .filter((label) => label.length > 0)
    .sort();
  return JSON.stringify(labels);
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

/**
 * Parse and validate a client-supplied column mapping (ADR-0018 commit path): a JSON object with a
 * non-negative integer index for each of the four roles. Extra keys are ignored. Throws on invalid
 * JSON, a non-object, a missing role, or a non-integer/negative index — the route maps that to 400.
 */
export function parseColumnMappingJson(raw: string): ColumnMapping {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("mapping must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  const result = {} as ColumnMapping;
  for (const role of ROLES) {
    const value = obj[role];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error(`mapping.${role} must be a non-negative integer`);
    }
    result[role] = value;
  }
  return result;
}

/** How many leading rows to scan for the header before giving up — bank preambles are short. */
const MAX_HEADER_SCAN = 50;

/** A located header row and the mapping resolved from it (so callers needn't re-detect). */
export interface HeaderDetection {
  /** Index of the detected header row; 0 when none fully resolved (the fallback). */
  index: number;
  /** Mapping resolved from that row — `unmatched` is empty on a real hit, populated on fallback. */
  mapping: ColumnMappingResult;
}

/**
 * Locate the real header row: the first row (within a bounded scan) whose labels resolve every
 * required role. Bank exports often carry preamble lines (account no., statement period, blanks)
 * above the header; this skips them. Data rows don't match header aliases, so they aren't mistaken
 * for the header. Falls back to row 0 when no row fully resolves, so the caller reports the gap
 * against the first row exactly as before. Returns the resolved mapping alongside the index so the
 * caller does not detect a second time.
 */
export function findHeaderRow(rows: ReadonlyArray<ReadonlyArray<string>>): HeaderDetection {
  const limit = Math.min(rows.length, MAX_HEADER_SCAN);
  for (let i = 0; i < limit; i++) {
    const mapping = detectColumnMapping(rows[i]);
    if (mapping.unmatched.length === 0) return { index: i, mapping };
  }
  return { index: 0, mapping: detectColumnMapping(rows[0] ?? []) };
}
