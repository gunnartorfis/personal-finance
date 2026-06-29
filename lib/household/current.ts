import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

import { householdContext } from "./context";

/**
 * The tenant guard (ADR-0002): the single entry point for server code that needs the current
 * Household. Resolves the signed-in user from the session (redirecting to sign-in if none),
 * provisions/loads their Household, and returns it with a household-scoped data-access repo — so
 * every downstream query is bound to one tenant and cross-household reads are impossible by
 * construction.
 */
export async function requireHousehold() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/sign-in");
  }
  const db = getDb();
  return { user, ...(await householdContext(db, user.id)) };
}
