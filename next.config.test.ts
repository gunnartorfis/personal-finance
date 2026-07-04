import { describe, expect, it } from "vitest"

import { baseConfig } from "./next.config"

/**
 * Guards the security response headers (plan 003). The load-bearing assertion is that the CSP ships
 * as `Content-Security-Policy-Report-Only` — a typo in that key would silently enforce (breaking the
 * Adyen payment Drop-in) or silently disable the policy, so this test is the regression guard.
 */
describe("security response headers", () => {
  it("applies one global rule carrying the security headers", async () => {
    expect(baseConfig.headers).toBeDefined()
    const rules = await baseConfig.headers!()
    expect(rules).toHaveLength(1)

    const rule = rules[0]
    expect(rule.source).toBe("/(.*)")
    const map = new Map(rule.headers.map((h) => [h.key, h.value]))

    expect(map.get("X-Content-Type-Options")).toBe("nosniff")
    expect(map.get("X-Frame-Options")).toBe("DENY")
    expect(map.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin")
    // Pin the exact value: `/max-age=\d+/` would also pass `max-age=0`, which silently disables HSTS.
    expect(map.get("Strict-Transport-Security")).toBe("max-age=2592000")
    expect(map.get("Permissions-Policy")).toContain("camera=()")
    expect(map.get("Permissions-Policy")).toContain("microphone=()")
    expect(map.get("Permissions-Policy")).toContain("geolocation=()")
  })

  it("ships the CSP as Report-Only with frame-ancestors 'none'", async () => {
    const rules = await baseConfig.headers!()
    const map = new Map(rules[0].headers.map((h) => [h.key, h.value]))

    // A bare Content-Security-Policy key would enforce; it must be absent.
    expect(map.has("Content-Security-Policy")).toBe(false)
    const csp = map.get("Content-Security-Policy-Report-Only")
    expect(csp).toBeDefined()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
  })
})
