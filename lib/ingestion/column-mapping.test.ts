import { describe, expect, it } from "vitest";

import {
  detectColumnMapping,
  findHeaderRow,
  headerSignature,
  parseColumnMappingJson,
} from "./column-mapping";

// Slice 2 (ADR-0018): detectColumnMapping now returns { resolved, unmatched }
// instead of `ColumnMapping | null`, so a partial match can name the roles that
// have no column (the preview/AI-fallback layers act on `unmatched`).
describe("detectColumnMapping", () => {
  it("resolves the standard Icelandic header with nothing unmatched", () => {
    expect(detectColumnMapping(["Dagsetning", "Mótaðili", "Tegund", "Upphæð"])).toEqual({
      resolved: { date: 0, merchant: 1, category: 2, amount: 3 },
      unmatched: [],
    });
  });

  it("resolves an English header in a different column order", () => {
    expect(detectColumnMapping(["Amount", "Description", "Date", "Category"])).toEqual({
      resolved: { amount: 0, merchant: 1, date: 2, category: 3 },
      unmatched: [],
    });
  });

  it("tolerates casing, whitespace, and decoration around the label", () => {
    expect(detectColumnMapping(["  DAGSETNING ", "Mótaðili", "Tegund", "Upphæð (ISK)"])).toEqual({
      resolved: { date: 0, merchant: 1, category: 2, amount: 3 },
      unmatched: [],
    });
  });

  it("does not pick the foreign-currency column as the amount", () => {
    const { resolved } = detectColumnMapping([
      "Dagsetning",
      "Mótaðili",
      "Tegund",
      "Upphæð",
      "Upphæð í erlendum gjaldmiðli",
    ]);
    expect(resolved.amount).toBe(3);
  });

  it("does not let a generic 'Name' column steal the merchant role from a real one", () => {
    expect(
      detectColumnMapping(["Dagsetning", "Account Name", "Mótaðili", "Tegund", "Upphæð"]),
    ).toEqual({
      resolved: { date: 0, merchant: 2, category: 3, amount: 4 },
      unmatched: [],
    });
  });

  it("matches a multi-word date header on its component token without concatenating", () => {
    // "Booking Date" matches via the "date" token; "Book ingdate" must NOT join to "bookingdate".
    expect(detectColumnMapping(["Booking Date", "Mótaðili", "Tegund", "Upphæð"]).resolved.date).toBe(
      0,
    );
    expect(detectColumnMapping(["Book ingdate", "Mótaðili", "Tegund", "Upphæð"]).unmatched).toEqual([
      "date",
    ]);
  });

  it("reports each role with no matching column in `unmatched`, resolving the rest", () => {
    // No amount column: date/merchant/category still resolve, amount is unmatched.
    expect(detectColumnMapping(["Dagsetning", "Mótaðili", "Tegund"])).toEqual({
      resolved: { date: 0, merchant: 1, category: 2 },
      unmatched: ["amount"],
    });
  });

  it("lists multiple unmatched roles in the canonical role order", () => {
    // Only a date column present; amount/merchant/category all unmatched.
    expect(detectColumnMapping(["Dagsetning"])).toEqual({
      resolved: { date: 0 },
      unmatched: ["amount", "merchant", "category"],
    });
  });
});

describe("findHeaderRow", () => {
  it("returns index 0 with the resolved mapping when the first row is the header", () => {
    expect(
      findHeaderRow([
        ["Dagsetning", "Mótaðili", "Tegund", "Upphæð"],
        ["01.03.2026", "X", "Y", "-1 kr."],
      ]),
    ).toEqual({
      index: 0,
      mapping: { resolved: { date: 0, merchant: 1, category: 2, amount: 3 }, unmatched: [] },
    });
  });

  it("skips bank preamble lines above the real header", () => {
    const rows = [
      ["Yfirlit reiknings 0133-26-000000"],
      [""],
      ["Tímabil: 01.03.2026 - 31.03.2026"],
      ["Dagsetning", "Mótaðili", "Tegund", "Upphæð"],
      ["01.03.2026", "NETFLIX", "Afþreying", "-1.990 kr."],
    ];
    expect(findHeaderRow(rows).index).toBe(3);
  });

  it("falls back to index 0 with the unmatched roles when no row fully resolves", () => {
    expect(findHeaderRow([["Foo", "Bar"], ["1", "2"]])).toEqual({
      index: 0,
      mapping: { resolved: {}, unmatched: ["date", "amount", "merchant", "category"] },
    });
  });

  it("does not mistake a data row for the header", () => {
    // Data cells (dates, merchant names) do not match header aliases, so row 0 (the header) wins.
    const rows = [
      ["Dagsetning", "Mótaðili", "Tegund", "Upphæð"],
      ["01.03.2026", "AMOUNT DUE STORE", "DATE NIGHT CAFE", "-1 kr."],
    ];
    expect(findHeaderRow(rows).index).toBe(0);
  });
});

describe("parseColumnMappingJson", () => {
  it("parses a valid mapping with all four role indices", () => {
    expect(parseColumnMappingJson('{"date":2,"amount":0,"merchant":1,"category":3}')).toEqual({
      date: 2,
      amount: 0,
      merchant: 1,
      category: 3,
    });
  });

  it("ignores extra keys, keeping only the four roles", () => {
    expect(
      parseColumnMappingJson('{"date":0,"amount":1,"merchant":2,"category":3,"junk":9}'),
    ).toEqual({ date: 0, amount: 1, merchant: 2, category: 3 });
  });

  it("throws when a role is missing", () => {
    expect(() => parseColumnMappingJson('{"date":0,"amount":1,"merchant":2}')).toThrow(/category/);
  });

  it("throws when a role index is not a non-negative integer", () => {
    expect(() => parseColumnMappingJson('{"date":0,"amount":-1,"merchant":2,"category":3}')).toThrow(
      /amount/,
    );
    expect(() =>
      parseColumnMappingJson('{"date":0,"amount":1.5,"merchant":2,"category":3}'),
    ).toThrow(/amount/);
  });

  it("throws on non-object / invalid JSON", () => {
    expect(() => parseColumnMappingJson("not json")).toThrow();
    expect(() => parseColumnMappingJson("[]")).toThrow();
  });
});

describe("headerSignature", () => {
  it("is independent of column order", () => {
    expect(headerSignature(["Dagsetning", "Mótaðili", "Tegund", "Upphæð"])).toBe(
      headerSignature(["Upphæð", "Tegund", "Mótaðili", "Dagsetning"]),
    );
  });

  it("is independent of casing, surrounding whitespace, and diacritics folding", () => {
    expect(headerSignature(["  DAGSETNING ", "Mótaðili"])).toBe(headerSignature(["dagsetning", "motadili"]));
  });

  it("differs when the set of columns differs (a changed export re-learns)", () => {
    expect(headerSignature(["Dagsetning", "Upphæð"])).not.toBe(
      headerSignature(["Dagsetning", "Upphæð", "Nótanúmer"]),
    );
  });

  it("ignores empty/blank labels", () => {
    expect(headerSignature(["Dagsetning", "", "  ", "Upphæð"])).toBe(
      headerSignature(["Dagsetning", "Upphæð"]),
    );
  });
});
