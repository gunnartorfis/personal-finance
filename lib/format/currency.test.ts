import { describe, expect, it } from "vitest";

import { currencyFormatter } from "./currency";

describe("currencyFormatter", () => {
  it("formats whole amounts with no fraction digits", () => {
    expect(currencyFormatter("USD").format(1234)).toBe("$1,234");
  });

  it("memoizes one formatter instance per currency", () => {
    expect(currencyFormatter("ISK")).toBe(currencyFormatter("ISK"));
    expect(currencyFormatter("ISK")).not.toBe(currencyFormatter("USD"));
  });
});
