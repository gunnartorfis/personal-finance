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

  it("auto-detects renamed columns in a different order (English header)", () => {
    const csv = [
      "Amount,Description,Date,Category",
      "-1.990 kr.,NETFLIX,01.03.2026,Afþreying",
    ].join("\n");
    const rows = parseStatementCsv(csv);
    expect(rows).toEqual([
      { sourceRow: 0, date: "2026-03-01", amount: -1990, merchant: "NETFLIX", rawCategory: "Afþreying" },
    ]);
  });

  it("throws on a file whose emitted rows exceed the row cap", () => {
    // 20_001 valid data rows — one past MAX_ROWS. Built programmatically, never a fixture file.
    const body = Array.from({ length: 20_001 }, () => "01.03.2026,SHOP,Verslun,-100 kr.").join("\n");
    const csv = `Dagsetning,Mótaðili,Tegund,Upphæð\n${body}`;
    expect(() => parseStatementCsv(csv)).toThrow(/too many rows/);
  });

  it("truncates an over-long merchant cell to the field cap instead of rejecting the row", () => {
    const bigMerchant = "A".repeat(10_000);
    const csv = `Dagsetning,Mótaðili,Tegund,Upphæð\n01.03.2026,${bigMerchant},Verslun,-100 kr.`;
    const rows = parseStatementCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].merchant).toHaveLength(200);
  });
});
