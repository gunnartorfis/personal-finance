import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the auth server so importing proxy.ts doesn't pull in the real Neon Auth module. A stable
// hoisted spy lets us assert whether authMiddleware runs for a given request.
const authFn = vi.hoisted(() => vi.fn(() => undefined))
vi.mock("@/lib/auth/server", () => ({
  auth: { middleware: () => authFn },
}))

import middleware, { config } from "./proxy"

describe("route-protection matcher", () => {
  const authedSegments = [
    "accounts",
    "dashboard",
    "savings",
    "settings",
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

  it("adds the /api matcher so the CSRF check runs on API routes", () => {
    expect(config.matcher).toContain("/api/:path*")
  })
})

describe("CSRF cross-site rejection on mutating API requests", () => {
  beforeEach(() => authFn.mockClear())

  const req = (path: string, method: string, site?: string) =>
    new NextRequest(`http://localhost${path}`, {
      method,
      headers: site ? { "sec-fetch-site": site } : {},
    })

  it("rejects a cross-site mutating API request with 403", () => {
    const res = middleware(req("/api/accounts", "POST", "cross-site"))
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(403)
  })

  it("rejects a same-site (sibling subdomain) mutating API request", () => {
    const res = middleware(req("/api/accounts", "PUT", "same-site"))
    expect((res as Response).status).toBe(403)
  })

  it("rejects cross-site PATCH and DELETE requests too (whole MUTATING set)", () => {
    expect((middleware(req("/api/accounts", "PATCH", "cross-site")) as Response).status).toBe(403)
    expect((middleware(req("/api/accounts", "DELETE", "cross-site")) as Response).status).toBe(403)
  })

  it("allows a same-origin mutating API request", () => {
    expect(middleware(req("/api/accounts", "POST", "same-origin"))).toBeUndefined()
  })

  it("allows a mutating API request with no sec-fetch-site header (non-browser caller)", () => {
    expect(middleware(req("/api/accounts", "POST"))).toBeUndefined()
  })

  it("ignores GET even when cross-site (non-mutating)", () => {
    expect(middleware(req("/api/billing/status", "GET", "cross-site"))).toBeUndefined()
  })

  it("exempts the Straumur webhook path", () => {
    expect(middleware(req("/api/webhooks/straumur", "POST", "cross-site"))).toBeUndefined()
  })

  it("exempts the Neon Auth handler path", () => {
    expect(middleware(req("/api/auth/anything", "POST", "cross-site"))).toBeUndefined()
  })

  it("never runs authMiddleware for /api paths (auth stays in the routes)", () => {
    middleware(req("/api/accounts", "POST", "same-origin"))
    middleware(req("/api/billing/status", "GET", "cross-site"))
    expect(authFn).not.toHaveBeenCalled()
  })

  it("still runs authMiddleware for a page path", () => {
    middleware(req("/dashboard", "GET"))
    expect(authFn).toHaveBeenCalledTimes(1)
  })
})
