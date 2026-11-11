import { describe, expect, it } from "vitest"
import { applicationUrl } from "./application-url"

const containerRequest = new Request("https://0.0.0.0:3000/api/open-banking/callback", {
  headers: { host: "attacker.invalid", "x-forwarded-host": "attacker.invalid" },
})
const production = { NODE_ENV: "production", APP_ORIGIN: "https://synthetic.up.railway.app" }

describe("canonical public application links", () => {
  it("keeps banking, payment and digest links on the public origin behind a container proxy", () => {
    for (const path of ["/api/open-banking/callback", "/accounts?bank=error", "/dashboard", "/digest/unsubscribe?token=synthetic&l=is"])
      expect(applicationUrl(path, containerRequest, production).toString())
        .toBe(`https://synthetic.up.railway.app${path}`)
  })
  it("requires a configured production origin instead of trusting request headers", () => {
    expect(() => applicationUrl("/dashboard", containerRequest, { NODE_ENV: "production" })).toThrow("APP_ORIGIN")
  })
  it("rejects invalid origins and external or backslash-escaped destinations", () => {
    for (const APP_ORIGIN of ["invalid", "http://synthetic.up.railway.app", "https://user:secret@example.com", "https://example.com/path", "https://example.com?x=1", "https://example.com#fragment"])
      expect(() => applicationUrl("/dashboard", containerRequest, { ...production, APP_ORIGIN })).toThrow("APP_ORIGIN")
    for (const path of ["https://attacker.invalid", "//attacker.invalid", "/\\attacker.invalid"])
      expect(() => applicationUrl(path, containerRequest, production)).toThrow("configured origin")
  })
  it("preserves local development without a public origin", () => {
    const request = new Request("http://localhost:3000/api/example")
    expect(applicationUrl("/dashboard", request, { NODE_ENV: "development" }).toString())
      .toBe("http://localhost:3000/dashboard")
  })
})
