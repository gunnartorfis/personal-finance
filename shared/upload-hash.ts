import { createHash } from "node:crypto";

/**
 * Exact-file import guard (ADR-0003).
 *
 * A Household re-uploads overlapping statements, so ingestion is idempotent in two layers.
 * This is the first layer: hash the upload's raw bytes and warn when the Household has already
 * imported a byte-identical file. (The second layer — row-fingerprint dedup — handles files that
 * overlap but are not byte-identical; see `dedup.ts`.) The guard is exact: any change to the
 * bytes yields a different hash, so a modified re-export is treated as a new file.
 */

/** The raw bytes of an uploaded file: the decoded text or its UTF-8 byte view. */
export type UploadBytes = string | Uint8Array;

/** SHA-256 hex digest of an upload's raw bytes — the exact-file identity. */
export function hashUpload(bytes: UploadBytes): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The result of checking an upload against the Household's already-imported files. */
export interface ExactFileCheck {
  /** The upload's content hash, to be stored against the Upload for future checks. */
  hash: string;
  /** True when a byte-identical file has already been imported by the Household. */
  alreadyImported: boolean;
}

/**
 * Hash `bytes` and report whether the Household has already imported a byte-identical file,
 * given the set of hashes it has imported before.
 */
export function checkExactFile(
  bytes: UploadBytes,
  importedHashes: Iterable<string>,
): ExactFileCheck {
  const hash = hashUpload(bytes);
  const set = importedHashes instanceof Set ? importedHashes : new Set(importedHashes);
  return { hash, alreadyImported: set.has(hash) };
}
