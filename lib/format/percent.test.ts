import { describe, expect, it } from "vitest"

import { percentFormatter } from "./percent"

describe("percentFormatter", () => {
  it("renders a 0..1 fraction as a whole percent (en)", () => {
    expect(percentFormatter("en").format(0.2)).toBe("20%")
    expect(percentFormatter("en").format(-0.05)).toBe("-5%")
  })

  it("rounds to whole percents with no fraction digits", () => {
    expect(percentFormatter("en").format(0.196)).toBe("20%")
  })

  it("shows an explicit + on positive values when signed", () => {
    expect(percentFormatter("en", true).format(0.2)).toBe("+20%")
    expect(percentFormatter("en", true).format(0)).toBe("0%")
  })

  it("formats a whole percent for the is locale", () => {
    expect(percentFormatter("is").format(0.2)).toBe("20%")
  })

  it("memoizes one formatter instance per locale + sign mode", () => {
    expect(percentFormatter("is")).toBe(percentFormatter("is"))
    expect(percentFormatter("is")).not.toBe(percentFormatter("is", true))
    expect(percentFormatter("is")).not.toBe(percentFormatter("en"))
  })
})
