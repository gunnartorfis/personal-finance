import { describe, expect, it } from "vitest";

import { resolveUpload } from "./resolve-mapping";

const csv = (...lines: string[]) => lines.join("\n");
const noRemembered = { findBySignature: async () => undefined };

describe("resolveUpload", () => {
  it("resolves via heuristics when the header is recognized", async () => {
    const r = await resolveUpload(
      noRemembered,
      csv("Dagsetning,Mótaðili,Tegund,Upphæð", "01.03.2026,NETFLIX,Afþreying,-1.990 kr."),
    );
    expect(r.source).toBe("heuristic");
    expect(r.unmatchedRoles).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it("replays a remembered mapping when heuristics can't resolve the header", async () => {
    const remembered = {
      findBySignature: async () => ({ columns: { date: 0, merchant: 1, category: 2, amount: 3 } }),
    };
    const r = await resolveUpload(
      remembered,
      csv("Foo,Bar,Baz,Qux", "01.03.2026,NETFLIX,Afþreying,-1.990 kr."),
    );
    expect(r.source).toBe("remembered");
    expect(r.unmatchedRoles).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.mapping).toEqual({ date: 0, merchant: 1, category: 2, amount: 3 });
  });

  it("returns source 'none' with the unmatched roles when neither resolves it", async () => {
    const r = await resolveUpload(noRemembered, csv("Foo,Bar,Baz,Qux", "1,2,3,4"));
    expect(r.source).toBe("none");
    expect(r.unmatchedRoles.length).toBeGreaterThan(0);
    expect(r.rows).toEqual([]);
  });

  it("prefers heuristics over a remembered mapping (only looks up on a heuristic miss)", async () => {
    let lookups = 0;
    const remembered = {
      findBySignature: async () => {
        lookups += 1;
        return { columns: { date: 0, merchant: 1, category: 2, amount: 3 } };
      },
    };
    const r = await resolveUpload(
      remembered,
      csv("Dagsetning,Mótaðili,Tegund,Upphæð", "01.03.2026,NETFLIX,Afþreying,-1.990 kr."),
    );
    expect(r.source).toBe("heuristic");
    expect(lookups).toBe(0);
  });
});
