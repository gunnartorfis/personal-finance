import { describe, expect, it } from "vitest";

import { prefillCorrection } from "./correction-prefill";

describe("prefillCorrection", () => {
  it("converts a DD.MM.YYYY date to ISO and normalises a readable amount", () => {
    expect(
      prefillCorrection({ date: "05.03.2026", amount: "-1.990 kr.", merchant: " BÓNUS " }),
    ).toEqual({ date: "2026-03-05", amount: "-1990", merchant: "BÓNUS" });
  });

  it("passes an ISO date through unchanged", () => {
    expect(prefillCorrection({ date: "2026-03-05", amount: "100", merchant: "X" }).date).toBe(
      "2026-03-05",
    );
  });

  it("blanks an unparseable date or amount for the Member to fill in", () => {
    const result = prefillCorrection({ date: "March 5", amount: "ódýrt", merchant: "X" });
    expect(result.date).toBe("");
    expect(result.amount).toBe("");
    expect(result.merchant).toBe("X");
  });
});
