import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";

/**
 * Server-side session helpers (ADR-0001). For use in Server Components, Server Actions, and route
 * handlers. The Household a user belongs to is resolved separately (Household provisioning / tenant
 * guard).
 */

/** The signed-in user for the current request, or `null` if unauthenticated. */
export async function getCurrentUser() {
  const { data: session } = await auth.getSession();
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
