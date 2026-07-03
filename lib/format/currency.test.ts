import { describe, expect, it } from "vitest"

import { currencyFormatter } from "./currency"

describe("currencyFormatter", () => {
  it("formats whole amounts with no fraction digits (en)", () => {
    expect(currencyFormatter("USD", "en").format(1234)).toBe("$1,234")
  })

  it("uses Icelandic conventions for the is locale", () => {
    // is-IS groups thousands with "." and renders ISK as "kr" — distinct from en.
    const formatted = currencyFormatter("ISK", "is").format(1234567)
    expect(formatted).toContain("1.234.567")
    expect(formatted).toContain("kr")
    expect(formatted).not.toBe(currencyFormatter("ISK", "en").format(1234567))
  })

  it("memoizes one formatter instance per locale + currency", () => {
    expect(currencyFormatter("ISK", "is")).toBe(currencyFormatter("ISK", "is"))
    expect(currencyFormatter("ISK", "is")).not.toBe(currencyFormatter("ISK", "en"))
    expect(currencyFormatter("ISK", "en")).not.toBe(currencyFormatter("USD", "en"))
  })
})
