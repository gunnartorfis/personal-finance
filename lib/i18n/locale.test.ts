import { describe, expect, it } from "vitest"

import { normalizeLocale } from "@/lib/i18n/locale"

describe("normalizeLocale", () => {
  it("defaults to Icelandic when the value is missing", () => {
    expect(normalizeLocale(undefined)).toBe("is")
  })

  it("keeps a supported locale", () => {
    expect(normalizeLocale("en")).toBe("en")
    expect(normalizeLocale("is")).toBe("is")
  })

  it("falls back to the default for an unsupported value", () => {
    expect(normalizeLocale("fr")).toBe("is")
  })
})
