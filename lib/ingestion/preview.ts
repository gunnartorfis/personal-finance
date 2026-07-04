import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { householdRepo } from "@/lib/db/household-repo";
import type * as schema from "@/lib/db/schema";
import { partitionNewRows, type FingerprintInput } from "@/shared/dedup";
import { hashUpload, type UploadBytes } from "@/shared/upload-hash";

import type { SuggestColumnMapping } from "./ai-mapping";
import type { ColumnMapping, ColumnRole } from "./column-mapping";
import type { ParsedRow } from "./parse-csv";
import { resolveUpload, type MappingSource } from "./resolve-mapping";

/**
 * Dry-run preview of an upload (ADR-0018): auto-detect the column mapping and, if complete, report
 * how many rows are new vs. already imported — WITHOUT writing anything. Backs `POST /api/uploads/
 * preview`, the first half of the preview-then-confirm flow. Read-only: it queries the account and
 * its stored rows but never inserts an Upload or Transactions (commit happens in `ingestUpload`).
 */
type Db = NodePgDatabase<typeof schema>;

export interface PreviewUploadInput {
  accountId: string;
  bytes: UploadBytes;
}

export type UploadPreview =
  | { status: "unknown-account" }
  | {
      status: "ok";
      /** The file's detected header row labels — the columns the mapping's indices point at. */
      header: string[];
      /** Roles that resolved to a column (may be partial when `unmatchedRoles` is non-empty). */
      detectedMapping: Partial<ColumnMapping>;
      /**
       * How the mapping was resolved (ADR-0018): "heuristic" (auto, safe to auto-commit),
       * "remembered" (replayed a confirmed mapping — the client should send it back on commit), "ai"
       * (a suggestion — always show for confirmation, never auto-commit), or "none" (unresolved;
       * `unmatchedRoles` is non-empty and the user must map the gaps).
       */
      mappingSource: MappingSource;
      /** Required roles with no matching column; when non-empty the UI must resolve them. */
      unmatchedRoles: ColumnRole[];
      /** Parsed rows the import would consider — empty while the mapping is incomplete. */
      rows: ParsedRow[];
      /** How many parsed rows are genuinely new (would be inserted on commit). */
      newCount: number;
      /** How many parsed rows are already stored for this account (would be skipped). */
      duplicateCount: number;
      /**
       * True when committing would add nothing: either this exact file was already imported
       * (file-hash match), or every parsed row is already stored. The UI surfaces this as a notice.
       */
      wholeFileDuplicate: boolean;
    };

export async function previewUpload(
  db: Db,
  householdId: string,
  input: PreviewUploadInput,
  suggest?: SuggestColumnMapping,
): Promise<UploadPreview> {
  const repo = householdRepo(db, householdId);

  if (!(await repo.accounts.findById(input.accountId))) {
    return { status: "unknown-account" };
  }

  const fileAlreadyImported = Boolean(
    await repo.uploads.findByFileHash(await hashUpload(input.bytes)),
  );

  const text = new TextDecoder().decode(input.bytes);
  // Resolve remembered → heuristic → AI (ADR-0018); shared with the commit route so both agree. The
  // AI fallback (`suggest`) is passed only here — a suggestion always needs the user's confirmation.
  const resolved = await resolveUpload(repo.columnMappings, text, suggest);

  // An unresolved mapping can't produce rows or a dedup count; the UI resolves the gaps first.
  if (resolved.unmatchedRoles.length > 0) {
    return {
      status: "ok",
      header: resolved.header,
      detectedMapping: resolved.mapping,
      mappingSource: resolved.source,
      unmatchedRoles: resolved.unmatchedRoles,
      rows: [],
      newCount: 0,
      duplicateCount: 0,
      wholeFileDuplicate: fileAlreadyImported,
    };
  }

  // Dedup dry-run: same fingerprint logic as appendTransactions, scoped to the account, no writes.
  const stored = await repo.transactions.listByAccount(input.accountId);
  const existing: FingerprintInput[] = stored.map((t) => ({
    date: t.date,
    amount: t.amount,
    merchant: t.merchant,
    category: t.rawCategory,
  }));
  const incoming = resolved.rows.map((r) => ({ ...r, category: r.rawCategory }));
  const { fresh, duplicates } = partitionNewRows(existing, incoming);

  return {
    status: "ok",
    header: resolved.header,
    detectedMapping: resolved.mapping,
    mappingSource: resolved.source,
    unmatchedRoles: [],
    rows: resolved.rows,
    newCount: fresh.length,
    duplicateCount: duplicates.length,
    wholeFileDuplicate: fileAlreadyImported || (resolved.rows.length > 0 && fresh.length === 0),
  };
}
