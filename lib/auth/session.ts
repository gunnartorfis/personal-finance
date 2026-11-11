import { redirect } from "next/navigation"

import { getIdentity } from "@/lib/auth/server"

/** Read the backend user, never client-provided email/verification claims.
 * Clerk's currentUser reads the backend user per request. The existing fresh option
 * remains compatible with invite callers; every read now has that authoritative behavior.
 */
export async function getCurrentUser(opts?: { fresh?: boolean }) {
  void opts
  return getIdentity()
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/sign-in")
  return user
}
