import { describe, expect, it } from "vitest";

import { detectColumnMapping } from "./column-mapping";

describe("detectColumnMapping", () => {
  it("maps the standard Icelandic header", () => {
    expect(detectColumnMapping(["Dagsetning", "Mótaðili", "Tegund", "Upphæð"])).toEqual({
      date: 0,
      merchant: 1,
      category: 2,
      amount: 3,
    });
  });

  it("maps an English header in a different column order", () => {
    expect(detectColumnMapping(["Amount", "Description", "Date", "Category"])).toEqual({
      amount: 0,
      merchant: 1,
      date: 2,
      category: 3,
    });
  });

  it("tolerates casing, whitespace, and decoration around the label", () => {
    expect(detectColumnMapping(["  DAGSETNING ", "Mótaðili", "Tegund", "Upphæð (ISK)"])).toEqual({
      date: 0,
      merchant: 1,
      category: 2,
      amount: 3,
    });
  });

  it("does not pick the foreign-currency column as the amount", () => {
    const mapping = detectColumnMapping([
      "Dagsetning",
      "Mótaðili",
      "Tegund",
      "Upphæð",
      "Upphæð í erlendum gjaldmiðli",
    ]);
    expect(mapping?.amount).toBe(3);
  });

  it("does not let a generic 'Name' column steal the merchant role from a real one", () => {
    expect(
      detectColumnMapping(["Dagsetning", "Account Name", "Mótaðili", "Tegund", "Upphæð"]),
    ).toEqual({ date: 0, merchant: 2, category: 3, amount: 4 });
  });

  it("matches a multi-word date header on its component token without concatenating", () => {
    // "Booking Date" matches via the "date" token; "Book ingdate" must NOT join to "bookingdate".
    expect(detectColumnMapping(["Booking Date", "Mótaðili", "Tegund", "Upphæð"])?.date).toBe(0);
    expect(detectColumnMapping(["Book ingdate", "Mótaðili", "Tegund", "Upphæð"])).toBeNull();
  });

  it("returns null when a required role has no matching column", () => {
    // No amount column.
    expect(detectColumnMapping(["Dagsetning", "Mótaðili", "Tegund"])).toBeNull();
  });
});
