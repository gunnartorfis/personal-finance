import { describe, expect, it } from "vitest";

import { canUseBankSync } from "./bank-sync";

describe("canUseBankSync", () => {
  it("allows Premium households", () => {
    expect(canUseBankSync("Premium")).toBe(true);
  });

  it("denies Free households (CSV-only)", () => {
    expect(canUseBankSync("Free")).toBe(false);
  });
});
