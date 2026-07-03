import { describe, expect, it } from "vitest"

import { localeFromAcceptLanguage, resolveLocale } from "@/lib/i18n/resolve"

describe("localeFromAcceptLanguage", () => {
  it("returns the highest-quality supported language", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,is;q=0.8")).toBe("en")
    expect(localeFromAcceptLanguage("is-IS,is;q=0.9,en;q=0.5")).toBe("is")
  })

  it("skips unsupported languages to the first supported one", () => {
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,is;q=0.4")).toBe("is")
  })

  it("respects quality ordering over header order", () => {
    expect(localeFromAcceptLanguage("en;q=0.3,is;q=0.9")).toBe("is")
  })

  it("returns null when nothing matches or the header is empty", () => {
    expect(localeFromAcceptLanguage("fr,de")).toBeNull()
    expect(localeFromAcceptLanguage("")).toBeNull()
    expect(localeFromAcceptLanguage(null)).toBeNull()
  })
})

describe("resolveLocale", () => {
  it("prefers a valid cookie above everything", () => {
    expect(
      resolveLocale({ cookie: "en", geoCountry: "IS", acceptLanguage: "is" })
    ).toBe("en")
  })

  it("ignores an invalid cookie and falls through", () => {
    expect(resolveLocale({ cookie: "fr", geoCountry: "IS" })).toBe("is")
  })

  it("uses Icelandic for an Icelandic geo when no cookie", () => {
    expect(resolveLocale({ geoCountry: "is", acceptLanguage: "en" })).toBe("is")
  })

  it("falls back to Accept-Language when geo is not IS", () => {
    expect(
      resolveLocale({ geoCountry: "US", acceptLanguage: "en-US,en;q=0.9" })
    ).toBe("en")
  })

  it("defaults to Icelandic when there is no usable signal", () => {
    expect(resolveLocale({})).toBe("is")
    expect(resolveLocale({ geoCountry: "US", acceptLanguage: "fr" })).toBe("is")
  })
})
