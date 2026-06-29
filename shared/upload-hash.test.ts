import { describe, expect, it } from "vitest";

import { checkExactFile, hashUpload } from "./upload-hash.ts";

const FILE_A = "Dagsetning,Mótaðili,Tegund,Upphæð\n01.03.2026,NETFLIX,Afþreying,-1.990 kr.\n";
const FILE_B = "Dagsetning,Mótaðili,Tegund,Upphæð\n02.03.2026,BONUS,Verslun,-3.200 kr.\n";

describe("hashUpload", () => {
  it("produces the same hash for byte-identical uploads", () => {
    expect(hashUpload(FILE_A)).toBe(hashUpload(FILE_A));
  });

  it("produces a different hash when a single byte changes", () => {
    expect(hashUpload(FILE_A)).not.toBe(hashUpload(FILE_A + " "));
  });

  it("is a 64-char hex SHA-256 digest", () => {
    expect(hashUpload(FILE_A)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes raw bytes the same whether given a string or its UTF-8 bytes", () => {
    expect(hashUpload(new TextEncoder().encode(FILE_A))).toBe(hashUpload(FILE_A));
  });
});

describe("checkExactFile", () => {
  it("flags a file the Household has already imported", () => {
    const imported = [hashUpload(FILE_A)];
    const result = checkExactFile(FILE_A, imported);
    expect(result.alreadyImported).toBe(true);
    expect(result.hash).toBe(hashUpload(FILE_A));
  });

  it("does not flag a file the Household has not imported", () => {
    const imported = [hashUpload(FILE_A)];
    expect(checkExactFile(FILE_B, imported).alreadyImported).toBe(false);
  });

  it("treats a one-byte-different re-export as a new file (row dedup handles overlap)", () => {
    const imported = [hashUpload(FILE_A)];
    expect(checkExactFile(FILE_A + "\n", imported).alreadyImported).toBe(false);
  });
});
