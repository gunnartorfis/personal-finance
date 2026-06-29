import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";

/**
 * Route-protection middleware (ADR-0001/0002). Next 16 names the middleware entry `proxy.ts`.
 * Unauthenticated requests to matched routes are redirected to the sign-in page.
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
  // Protect the dashboard root and account pages; the public auth pages stay open.
  matcher: ["/", "/account/:path*"],
};
