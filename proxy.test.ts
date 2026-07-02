import { describe, expect, it, vi } from "vitest"

// Mock the auth server so importing proxy.ts doesn't pull in the real Neon Auth module.
vi.mock("@/lib/auth/server", () => ({
  auth: { middleware: () => () => undefined },
}))

import { config } from "./proxy"

describe("route-protection matcher", () => {
  const authedSegments = [
    "account",
    "accounts",
    "billing",
    "dashboard",
    "household",
    "rules",
    "savings",
    "transactions",
    "upload",
  ]

  it("protects every signed-in (app) route segment", () => {
    for (const segment of authedSegments) {
      expect(config.matcher).toContain(`/${segment}/:path*`)
    }
  })

  it("leaves the marketing root and public routes unprotected", () => {
    // A matcher entry for "/" (root), auth, or join would break the public marketing/sign-in flow.
    expect(config.matcher).not.toContain("/")
    // A catch-all like "/:path*" or "/(.*)" would intercept root + public routes too — reject those.
    expect(config.matcher.some((m) => m === "/:path*" || m === "/(.*)" || m === "/((?!).*)")).toBe(false)
    expect(config.matcher.some((m) => m.startsWith("/auth"))).toBe(false)
    expect(config.matcher.some((m) => m.startsWith("/join"))).toBe(false)
  })
})
