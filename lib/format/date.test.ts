import { describe, expect, it } from "vitest"

import { formatCycleMonth } from "./date"

describe("formatCycleMonth", () => {
  it("formats a YYYY-MM key as a long month + year in en", () => {
    expect(formatCycleMonth("2026-03", "en")).toBe("March 2026")
  })

  it("uses Icelandic month names for the is locale", () => {
    const label = formatCycleMonth("2026-03", "is")
    expect(label.toLowerCase()).toContain("mars")
    expect(label).toContain("2026")
    expect(label).not.toBe(formatCycleMonth("2026-03", "en"))
  })

  it("supports a short style without the year", () => {
    expect(formatCycleMonth("2026-03", "en", { short: true })).toBe("Mar")
  })
})
