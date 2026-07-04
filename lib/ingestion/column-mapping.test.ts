import { describe, expect, it } from "vitest";

import { detectColumnMapping } from "./column-mapping";

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
