import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";

/**
 * Route-protection middleware (ADR-0001/0002). Next 16 names the middleware entry `proxy.ts`.
 * Unauthenticated requests to matched routes are redirected to the sign-in page. The root `/` is
 * intentionally left public so signed-out visitors get the marketing landing page; `app/page.tsx`
 * sends signed-in members on to the dashboard.
 */
const authMiddleware = auth.middleware({ loginUrl: "/auth/sign-in" });

export default function middleware(request: NextRequest) {
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
    "/account/:path*",
    "/accounts/:path*",
    "/billing/:path*",
    "/dashboard/:path*",
    "/household/:path*",
    "/rules/:path*",
    "/savings/:path*",
    "/transactions/:path*",
    "/upload/:path*",
  ],
};
