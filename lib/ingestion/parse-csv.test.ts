import { describe, expect, it } from "vitest";

import { parseStatementCsv } from "./parse-csv";

const CSV = [
  "Dagsetning,Mótaðili,Tegund,Upphæð",
  "01.03.2026,NETFLIX,Afþreying,-1.990 kr.",
  "-------,,,", // separator row, skipped
  "05.03.2026,BÓNUS,Verslun,-3.200 kr.",
].join("\n");

describe("parseStatementCsv", () => {
  it("parses date, amount, merchant and raw category, skipping non-date rows", () => {
    const rows = parseStatementCsv(CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      sourceRow: 0,
      date: "2026-03-01",
      amount: -1990,
      merchant: "NETFLIX",
      rawCategory: "Afþreying",
    });
    expect(rows[1].date).toBe("2026-03-05");
    expect(rows[1].amount).toBe(-3200);
  });

  it("preserves the source row index across skipped rows", () => {
    // the BÓNUS row is data-row index 2 (the separator is index 1)
    const rows = parseStatementCsv(CSV);
    expect(rows[1].sourceRow).toBe(2);
  });

  it("throws when required columns are missing", () => {
    expect(() => parseStatementCsv("Foo,Bar\n1,2\n")).toThrow(/missing required columns/);
  });
});
