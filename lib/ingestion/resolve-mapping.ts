import type { SuggestColumnMapping } from "./ai-mapping";
import { headerSignature, type ColumnMapping, type ColumnRole } from "./column-mapping";
import {
  attemptParse,
  parseWithMappingAndHeader,
  type ParsedRow,
  type WithheldRow,
} from "./parse-csv";

/**
 * How a file's column mapping was resolved (ADR-0018 precedence): a header-heuristic match, a replay
 * of a mapping the Household confirmed before, an AI suggestion (a guess — always shown for
 * confirmation, never auto-committed), or `none` when nothing could resolve it (the user must map).
 */
export type MappingSource = "heuristic" | "remembered" | "ai" | "none";

export interface ResolvedUpload {
  /** The detected header row (for computing a signature / display). */
  header: string[];
  /** Roles resolved to a column (complete unless `source` is "none"). */
  mapping: Partial<ColumnMapping>;
  /** Required roles still unmatched; empty unless `source` is "none". */
  unmatchedRoles: ColumnRole[];
  /** Parsed rows — populated when the mapping is complete, else `[]`. */
  rows: ParsedRow[];
  /** Rows the parser couldn't read, retained with a reason (ADR-0025); `[]` when unmapped. */
  withheld: WithheldRow[];
  source: MappingSource;
}

/** The slice of the column-mappings repo this resolver needs (kept narrow for easy testing). */
export interface RememberedMappingLookup {
  findBySignature: (headerSignature: string) => Promise<{ columns: ColumnMapping } | undefined>;
}

/**
 * Resolve a file's column mapping with the ADR-0018 precedence **remembered → heuristic → AI**,
 * shared by the preview (`previewUpload`) and the commit route so both agree on how an unrecognized
 * header is handled: the heuristics run first; if they leave any role unmatched, a mapping the
 * Household confirmed before for the same header signature is replayed; and if an optional AI
 * `suggest` is provided (preview only — a suggestion always needs confirmation), it is the last
 * resort. Returns `source: "none"` (with the unmatched roles) when nothing resolves it.
 */
export async function resolveUpload(
  remembered: RememberedMappingLookup,
  text: string,
  suggest?: SuggestColumnMapping,
): Promise<ResolvedUpload> {
  const attempt = attemptParse(text);
  if (attempt.unmatchedRoles.length === 0) {
    return {
      header: attempt.header,
      mapping: attempt.detectedMapping,
      unmatchedRoles: [],
      rows: attempt.rows,
      withheld: attempt.withheld,
      source: "heuristic",
    };
  }

  // Heuristics failing means the header sits at row 0 (findHeaderRow's fallback), so a remembered or
  // AI-suggested mapping's indices align with parseWithMapping's row-0-header contract.
  const hit = await remembered.findBySignature(headerSignature(attempt.header));
  if (hit) {
    const parsed = parseWithMappingAndHeader(text, hit.columns);
    return {
      header: attempt.header,
      mapping: hit.columns,
      unmatchedRoles: [],
      rows: parsed.rows,
      withheld: parsed.withheld,
      source: "remembered",
    };
  }

  if (suggest) {
    const ai = await suggest(attempt.header, attempt.sampleRows);
    if (ai) {
      const parsed = parseWithMappingAndHeader(text, ai);
      return {
        header: attempt.header,
        mapping: ai,
        unmatchedRoles: [],
        rows: parsed.rows,
        withheld: parsed.withheld,
        source: "ai",
      };
    }
  }

  return {
    header: attempt.header,
    mapping: attempt.detectedMapping,
    unmatchedRoles: attempt.unmatchedRoles,
    rows: [],
    withheld: [],
    source: "none",
  };
}
