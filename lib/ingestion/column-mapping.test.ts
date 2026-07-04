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

  it("returns null when a required role has no matching column", () => {
    // No amount column.
    expect(detectColumnMapping(["Dagsetning", "Mótaðili", "Tegund"])).toBeNull();
  });
});
