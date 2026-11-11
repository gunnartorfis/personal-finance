import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const authFn = vi.hoisted(() => vi.fn())
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: (auth: null, request: NextRequest) => Response | undefined) =>
    (request: NextRequest) => { authFn(); return handler(null, request) },
}))

import proxy, { config } from "./proxy"

// The Clerk mock above is synchronous; the real middleware also receives NextFetchEvent.
const middleware = proxy as unknown as (request: NextRequest) => Response | undefined

describe("route-protection matcher", () => {
  const authedSegments = [
    "accounts",
    "dashboard",
    "savings",
    "settings",
    "transactions",
    "upload",
  ]

  it("initializes Clerk for every signed-in (app) route segment", () => {
    for (const segment of authedSegments) {
      expect(config.matcher).toContain(`/${segment}/:path*`)
    }
  })

  it("initializes Clerk on public pages without forcing a sign-in redirect", () => {
    expect(config.matcher).toContain("/")
    expect(config.matcher).toContain("/auth/:path*")
    expect(config.matcher).toContain("/join/:path*")
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

  it("does not exempt the retired auth namespace", () => {
    expect((middleware(req("/api/auth/anything", "POST", "cross-site")) as Response).status).toBe(403)
  })

  it("initializes Clerk context for API paths while route guards enforce authorization", () => {
    middleware(req("/api/accounts", "POST", "same-origin"))
    middleware(req("/api/billing/status", "GET", "cross-site"))
    expect(authFn).toHaveBeenCalledTimes(2)
  })

  it("still runs authMiddleware for a page path", () => {
    middleware(req("/dashboard", "GET"))
    expect(authFn).toHaveBeenCalledTimes(1)
  })
})
