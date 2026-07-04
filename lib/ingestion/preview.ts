import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { householdRepo } from "@/lib/db/household-repo";
import type * as schema from "@/lib/db/schema";
import { partitionNewRows, type FingerprintInput } from "@/shared/dedup";
import { hashUpload, type UploadBytes } from "@/shared/upload-hash";

import type { ColumnMapping, ColumnRole } from "./column-mapping";
import { attemptParse, type ParsedRow } from "./parse-csv";

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
      /** Roles that resolved to a column (may be partial when `unmatchedRoles` is non-empty). */
      detectedMapping: Partial<ColumnMapping>;
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
): Promise<UploadPreview> {
  const repo = householdRepo(db, householdId);

  if (!(await repo.accounts.findById(input.accountId))) {
    return { status: "unknown-account" };
  }

  const fileAlreadyImported = Boolean(
    await repo.uploads.findByFileHash(await hashUpload(input.bytes)),
  );

  const { detectedMapping, unmatchedRoles, rows } = attemptParse(
    new TextDecoder().decode(input.bytes),
  );

  // An incomplete mapping can't produce rows or a dedup count; the UI resolves the gaps first.
  if (unmatchedRoles.length > 0) {
    return {
      status: "ok",
      detectedMapping,
      unmatchedRoles,
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
  const incoming = rows.map((r) => ({ ...r, category: r.rawCategory }));
  const { fresh, duplicates } = partitionNewRows(existing, incoming);

  return {
    status: "ok",
    detectedMapping,
    unmatchedRoles: [],
    rows,
    newCount: fresh.length,
    duplicateCount: duplicates.length,
    wholeFileDuplicate: fileAlreadyImported || (rows.length > 0 && fresh.length === 0),
  };
}
