import { describe, expect, it } from "vitest";

import { checkExactFile, hashUpload } from "./upload-hash.ts";

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

const FILE_A = bytes("Dagsetning,Mótaðili,Tegund,Upphæð\n01.03.2026,NETFLIX,Afþreying,-1.990 kr.\n");
const FILE_B = bytes("Dagsetning,Mótaðili,Tegund,Upphæð\n02.03.2026,BONUS,Verslun,-3.200 kr.\n");

describe("hashUpload", () => {
  it("produces the same hash for byte-identical uploads", async () => {
    expect(await hashUpload(FILE_A)).toBe(await hashUpload(bytes(new TextDecoder().decode(FILE_A))));
  });

  it("produces a different hash when a single byte changes", async () => {
    expect(await hashUpload(FILE_A)).not.toBe(await hashUpload(bytes("Dagsetning,Mótaðili,Tegund,Upphæð\n01.03.2026,NETFLIX,Afþreying,-1.990 kr.\n ")));
  });

  it("is a 64-char hex SHA-256 digest", async () => {
    expect(await hashUpload(FILE_A)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("checkExactFile", () => {
  it("flags a file the Household has already imported", async () => {
    const imported = [await hashUpload(FILE_A)];
    const result = await checkExactFile(FILE_A, imported);
    expect(result.alreadyImported).toBe(true);
    expect(result.hash).toBe(await hashUpload(FILE_A));
  });

  it("does not flag a file the Household has not imported", async () => {
    const imported = [await hashUpload(FILE_A)];
    expect((await checkExactFile(FILE_B, imported)).alreadyImported).toBe(false);
  });

  it("treats a one-byte-different re-export as a new file (row dedup handles overlap)", async () => {
    const imported = [await hashUpload(FILE_A)];
    const modified = bytes(new TextDecoder().decode(FILE_A) + "\n");
    expect((await checkExactFile(modified, imported)).alreadyImported).toBe(false);
  });
});
