import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

import { ensureHouseholdForUser } from "./provision";

/**
 * The tenant context for a user (ADR-0002): their Household and a data-access repo scoped to it.
 * Kept free of auth imports so it can be unit-tested; the request-level guard that reads the
 * session lives in `current.ts`.
 */
type Db = NodePgDatabase<typeof schema>;

/** Resolve (provisioning if needed) the Household for `authUserId`, its Plan, and a scoped repo. */
export async function householdContext(db: Db, authUserId: string) {
  const { householdId, memberId } = await ensureHouseholdForUser(db, authUserId);
  const [household] = await db.select().from(households).where(eq(households.id, householdId));
  return { householdId, memberId, plan: household.plan, repo: householdRepo(db, householdId) };
}
