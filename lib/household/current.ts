import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

import { householdContext } from "./context";
import { findActiveInvitesByEmail } from "./invites";
import { findMembership } from "./provision";

/**
 * The tenant guard (ADR-0002): the single entry point for server code that needs the current
 * Household. Resolves the signed-in user from the session (redirecting to sign-in if none),
 * provisions/loads their Household, and returns it with a household-scoped data-access repo — so
 * every downstream query is bound to one tenant and cross-household reads are impossible by
 * construction.
 *
 * Invite intercept (ADR-0010): a signed-in user who is NOT yet a Member but has a pending Invite
 * addressed to their verified email is redirected to `/join` instead of being auto-provisioned a
 * fresh Household — otherwise an invited spouse would land in a stray empty Household and hit the
 * "leave first" wall. Existing Members (with or without a pending Invite) are unaffected.
 */
export async function requireHousehold() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/sign-in");
  }
  const db = getDb();

  const membership = await findMembership(db, user.id);
  if (!membership && user.emailVerified) {
    const invites = await findActiveInvitesByEmail(db, user.email);
    if (invites.length > 0) {
      redirect("/join");
    }
  }

  return { user, ...(await householdContext(db, user.id)) };
}
