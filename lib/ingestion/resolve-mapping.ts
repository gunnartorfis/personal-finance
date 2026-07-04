import { headerSignature, type ColumnMapping, type ColumnRole } from "./column-mapping";
import { attemptParse, parseWithMapping, type ParsedRow } from "./parse-csv";

/**
 * How a file's column mapping was resolved (ADR-0018 precedence): a header-heuristic match, a
 * replay of a mapping the Household confirmed before, or `none` when neither could fully resolve it
 * (the caller then asks the user, or — later — the AI fallback).
 */
export type MappingSource = "heuristic" | "remembered" | "none";

export interface ResolvedUpload {
  /** The detected header row (for computing a signature / display). */
  header: string[];
  /** Roles resolved to a column (complete unless `source` is "none"). */
  mapping: Partial<ColumnMapping>;
  /** Required roles still unmatched; empty unless `source` is "none". */
  unmatchedRoles: ColumnRole[];
  /** Parsed rows — populated when the mapping is complete, else `[]`. */
  rows: ParsedRow[];
  source: MappingSource;
}

/** The slice of the column-mappings repo this resolver needs (kept narrow for easy testing). */
export interface RememberedMappingLookup {
  findBySignature: (headerSignature: string) => Promise<{ columns: ColumnMapping } | undefined>;
}

/**
 * Resolve a file's column mapping with the ADR-0018 precedence **remembered → heuristic**, shared by
 * the preview (`previewUpload`) and the commit route so both agree on how an unrecognized header is
 * handled: the heuristics run first; if they leave any role unmatched, a mapping the Household
 * confirmed before for the same header signature is replayed. Returns `source: "none"` (with the
 * unmatched roles) when neither resolves it, so the caller can ask the user rather than fail.
 */
export async function resolveUpload(
  remembered: RememberedMappingLookup,
  text: string,
): Promise<ResolvedUpload> {
  const attempt = attemptParse(text);
  if (attempt.unmatchedRoles.length === 0) {
    return {
      header: attempt.header,
      mapping: attempt.detectedMapping,
      unmatchedRoles: [],
      rows: attempt.rows,
      source: "heuristic",
    };
  }

  const hit = await remembered.findBySignature(headerSignature(attempt.header));
  if (hit) {
    // Heuristics failing means the header sits at row 0 (findHeaderRow's fallback), so the remembered
    // indices align with parseWithMapping's row-0-header contract.
    return {
      header: attempt.header,
      mapping: hit.columns,
      unmatchedRoles: [],
      rows: parseWithMapping(text, hit.columns),
      source: "remembered",
    };
  }

  return {
    header: attempt.header,
    mapping: attempt.detectedMapping,
    unmatchedRoles: attempt.unmatchedRoles,
    rows: [],
    source: "none",
  };
}
