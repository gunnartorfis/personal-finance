/**
 * Exact-file import guard (ADR-0003).
 *
 * A Household re-uploads overlapping statements, so ingestion is idempotent in two layers.
 * This is the first layer: hash the upload's raw bytes and warn when the Household has already
 * imported a byte-identical file. (The second layer — row-fingerprint dedup — handles files that
 * overlap but are not byte-identical; see `dedup.ts`.) The guard is exact: any change to the
 * bytes yields a different hash, so a modified re-export is treated as a new file.
 *
 * Hashing is over RAW bytes, never decoded text: decoding can fold invalid/non-UTF-8 byte
 * sequences into U+FFFD replacement characters, which would let distinct files collide. Callers
 * pass the upload's bytes (e.g. `new Uint8Array(await file.arrayBuffer())`). The Web Crypto API
 * is used so the helper runs unchanged in Node, the browser, and edge runtimes.
 */

/** The raw bytes of an uploaded file, before any text decoding. */
export type UploadBytes = Uint8Array;

/** SHA-256 hex digest of an upload's raw bytes — the exact-file identity. */
export async function hashUpload(bytes: UploadBytes): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
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
export async function checkExactFile(
  bytes: UploadBytes,
  importedHashes: Iterable<string>,
): Promise<ExactFileCheck> {
  const hash = await hashUpload(bytes);
  const set = importedHashes instanceof Set ? importedHashes : new Set(importedHashes);
  return { hash, alreadyImported: set.has(hash) };
}
