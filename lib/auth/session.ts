import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";

/**
 * Server-side session helpers (ADR-0001). For use in Server Components, Server Actions, and route
 * handlers. The Household a user belongs to is resolved separately (Household provisioning / tenant
 * guard).
 */

/**
 * The signed-in user for the current request, or `null` if unauthenticated.
 *
 * By default this can be served from Neon Auth's signed session-data cookie (fast, no upstream call).
 * That cookie caches user fields — including `emailVerified` — so a value that changed since the
 * cookie was minted (e.g. the user just verified their email, possibly in another tab) reads stale.
 * Pass `{ fresh: true }` to bypass the cookie cache and re-read the session from source when an
 * authoritative `emailVerified` matters (the invite verify-gate and the accept endpoint).
 */
export async function getCurrentUser(opts?: { fresh?: boolean }) {
  const { data: session } = await auth.getSession(
    opts?.fresh ? { query: { disableCookieCache: "true" } } : undefined,
  );
  return session?.user ?? null;
}

/**
 * The signed-in user, or **redirect to the sign-in page** when unauthenticated. For gating Server
 * Components / pages — `redirect()` issues a real navigation rather than rendering an error
 * boundary. (Route handlers that want a 401 should use {@link getCurrentUser} instead.)
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/sign-in");
  }
  return user;
}
