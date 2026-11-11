import { clerkMiddleware } from "@clerk/nextjs/server"
import type { NextRequest } from "next/server"

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"])

/** Additional browser CSRF boundary. API identity/household checks remain in handlers.
 * Webhooks use their own HMAC boundary. Clerk's frontend API is hosted separately;
 * the retired Neon Auth namespace has no exemption or handler.
 */
export function checkRequestBoundary(request: NextRequest) {
  const site = request.headers.get("sec-fetch-site")
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    !request.nextUrl.pathname.startsWith("/api/webhooks/") &&
    MUTATING.has(request.method) &&
    site !== null && site !== "same-origin" && site !== "none"
  ) return new Response("Cross-site request rejected", { status: 403 })
}

// Initialize Clerk for public and protected requests. Data-access guards enforce
// sign-in and household ownership; APIs retain 401 responses rather than redirects.
export default clerkMiddleware((_auth, request) => checkRequestBoundary(request))

export const config = {
  matcher: [
    "/accounts/:path*", "/dashboard/:path*", "/savings/:path*",
    "/settings/:path*", "/transactions/:path*", "/upload/:path*",
    "/api/:path*", "/", "/auth/:path*", "/join/:path*",
  ],
}
