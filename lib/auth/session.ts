import { auth } from "@/lib/auth/server";

/**
 * Server-side session helpers (ADR-0001). Thin wrappers over Neon Auth's `getSession()` for use in
 * Server Components, Server Actions, and route handlers. The Household a user belongs to is
 * resolved separately (Household provisioning / tenant guard).
 */

/** The signed-in user for the current request, or `null` if unauthenticated. */
export async function getCurrentUser() {
  const { data: session } = await auth.getSession();
  return session?.user ?? null;
}

/** The signed-in user, or throw — for server code that requires authentication. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}
