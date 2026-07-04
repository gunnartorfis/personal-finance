import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";

/**
 * Route-protection middleware (ADR-0001/0002). Next 16 names the middleware entry `proxy.ts`.
 * Unauthenticated requests to matched routes are redirected to the sign-in page. The root `/` is
 * intentionally left public so signed-out visitors get the marketing landing page; `app/page.tsx`
 * sends signed-in members on to the dashboard.
 */
const authMiddleware = auth.middleware({ loginUrl: "/auth/sign-in" });

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Paths that legitimately receive non-browser mutating POSTs: the Straumur webhook (HMAC is its
// trust boundary) and Neon Auth's own handler (manages its own flows).
const CSRF_EXEMPT = [/^\/api\/webhooks\//, /^\/api\/auth\//];

/**
 * CSRF defense-in-depth: is this a mutating request whose browser-set `Sec-Fetch-Site` header proves
 * a cross-site initiator? The header is sent by all browsers since ~2020 and cannot be forged or
 * stripped by web content, so it's a library-independent guard that holds even if the Neon Auth
 * session cookie's SameSite default ever changes. Absent header = non-browser client (webhooks, curl,
 * tests) or a very old browser — the SameSite cookie remains the defense there. "none" = a
 * user-initiated top-level navigation (e.g. the address bar), which is not a CSRF vector.
 */
function isCrossSite(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes self-guard for *auth* via requireHousehold(); the middleware only adds the *CSRF*
  // check here and must never run authMiddleware on them (that would send /api through the sign-in
  // redirect). "same-site" (a sibling subdomain) is deliberately rejected — nothing legit calls the
  // API cross-subdomain.
  if (pathname.startsWith("/api/")) {
    if (
      MUTATING.has(request.method) &&
      !CSRF_EXEMPT.some((re) => re.test(pathname)) &&
      isCrossSite(request)
    ) {
      return new Response("Cross-site request rejected", { status: 403 });
    }
    return;
  }

  // Don't intercept Server Action POSTs (they carry a Next-Action header).
  if (request.headers.has("Next-Action")) {
    return;
  }
  return authMiddleware(request);
}

export const config = {
  // Protect the signed-in `(app)` routes at the edge (pages also self-guard via requireHousehold).
  // The root marketing page (`/`), the auth pages (`/auth/*`), invite links (`/join/*`), and API
  // routes (which guard themselves) stay open. Keep in sync with the `app/(app)/*` route segments.
  matcher: [
    "/accounts/:path*",
    "/dashboard/:path*",
    "/savings/:path*",
    "/settings/:path*",
    "/transactions/:path*",
    "/upload/:path*",
    // API routes run the CSRF cross-site check only (they self-guard for auth via requireHousehold).
    "/api/:path*",
  ],
};
