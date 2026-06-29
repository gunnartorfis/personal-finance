import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { isUniqueViolation } from "@/lib/db/errors";
import { householdRepo } from "@/lib/db/household-repo";
import type * as schema from "@/lib/db/schema";
import type { uploads } from "@/lib/db/schema";
import { hashUpload, type UploadBytes } from "@/shared/upload-hash";

import { appendTransactions } from "./append";
import type { ParsedRow } from "./parse-csv";

/**
 * Upload ingestion (ADR-0003): register a CSV upload for a Household (guarded by the exact-file
 * hash) and append its parsed rows as pending Transactions — atomically. The Upload row and its
 * Transactions are written in one transaction, so a failure mid-append rolls back the Upload too;
 * there are no orphaned uploads that would block a clean re-upload.
 */
type Db = NodePgDatabase<typeof schema>;
type Upload = typeof uploads.$inferSelect;

export interface IngestUploadInput {
  accountId: string;
  fileName: string;
  bytes: UploadBytes;
  importedByMemberId?: string;
  rows: ParsedRow[];
}

export type IngestResult =
  | { status: "created"; upload: Upload; appended: number; duplicates: number }
  | { status: "duplicate"; fileHash: string }
  | { status: "unknown-account" };

export async function ingestUpload(
  db: Db,
  householdId: string,
  input: IngestUploadInput,
): Promise<IngestResult> {
  const repo = householdRepo(db, householdId);

  // Pre-checks (no writes): a missing/foreign account, or an exact re-import, are clean results.
  if (!(await repo.accounts.findById(input.accountId))) {
    return { status: "unknown-account" };
  }
  const fileHash = await hashUpload(input.bytes);
  if (await repo.uploads.findByFileHash(fileHash)) {
    return { status: "duplicate", fileHash };
  }

  try {
    return await db.transaction(async (tx) => {
      const txRepo = householdRepo(tx as unknown as Db, householdId);
      const [upload] = await txRepo.uploads.create({
        accountId: input.accountId,
        fileName: input.fileName,
        fileHash,
        importedByMemberId: input.importedByMemberId,
      });
      if (!upload) throw new Error("upload insert returned no row");
      const { appended, duplicates } = await appendTransactions(txRepo, {
        uploadId: upload.id,
        accountId: input.accountId,
        rows: input.rows,
      });
      return { status: "created", upload, appended, duplicates };
    });
  } catch (err) {
    // A concurrent upload of the same file committed first; the rolled-back tx surfaces the
    // unique(household_id, file_hash) violation. Report it as a duplicate, not a 500.
    if (isUniqueViolation(err)) {
      return { status: "duplicate", fileHash };
    }
    throw err;
  }
}
