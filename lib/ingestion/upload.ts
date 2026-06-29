import { isUniqueViolation } from "@/lib/db/errors";
import type { HouseholdRepo } from "@/lib/db/household-repo";
import type { uploads } from "@/lib/db/schema";
import { hashUpload, type UploadBytes } from "@/shared/upload-hash";

/**
 * Upload ingestion — step one (ADR-0003): register a CSV upload for a Household, guarded by the
 * exact-file hash. Operates through a household-scoped repo, so it can only ever read/write the
 * caller's own Household. Row parsing + Transaction append happen separately ("append rows").
 */

type Upload = typeof uploads.$inferSelect;

export interface CreateUploadInput {
  /** The Account these rows belong to (must be in the same Household; enforced by the schema). */
  accountId: string;
  fileName: string;
  /** The raw uploaded bytes (e.g. `new Uint8Array(await file.arrayBuffer())`). */
  bytes: UploadBytes;
  /** The Member performing the upload, if known. */
  importedByMemberId?: string;
}

export type CreateUploadResult =
  | { status: "created"; upload: Upload }
  | { status: "duplicate"; fileHash: string }
  | { status: "unknown-account" };

/**
 * Hash the upload and either register it or report it as an exact re-import the Household already
 * has (the warn path of ADR-0003's exact-file guard; the DB unique constraint is the backstop).
 */
export async function createUpload(
  repo: HouseholdRepo,
  input: CreateUploadInput,
): Promise<CreateUploadResult> {
  // The Account must exist in this Household. The scoped lookup also rejects another household's
  // account (returns undefined), so a bad/foreign accountId is a clean result, not an FK 500.
  if (!(await repo.accounts.findById(input.accountId))) {
    return { status: "unknown-account" };
  }

  const fileHash = await hashUpload(input.bytes);

  // Fast path: targeted indexed lookup (household_id, file_hash) instead of scanning all uploads.
  if (await repo.uploads.findByFileHash(fileHash)) {
    return { status: "duplicate", fileHash };
  }

  try {
    const [upload] = await repo.uploads.create({
      accountId: input.accountId,
      fileName: input.fileName,
      fileHash,
      importedByMemberId: input.importedByMemberId,
    });
    if (!upload) throw new Error("upload insert returned no row");
    return { status: "created", upload };
  } catch (err) {
    // TOCTOU: a concurrent upload of the same file committed first. The unique
    // (household_id, file_hash) constraint catches it — report it as a duplicate, not a 500.
    if (isUniqueViolation(err)) {
      return { status: "duplicate", fileHash };
    }
    throw err;
  }
}
