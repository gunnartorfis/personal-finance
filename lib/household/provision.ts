import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { households, members } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

/**
 * Household provisioning (ADR-0002): one Household per user in v1.
 *
 * On (or after) sign-in, a signed-in Stack/Neon Auth user is mapped to exactly one Household via a
 * Member row keyed by `authUserId`. `ensureHouseholdForUser` is idempotent: the first call creates
 * the Household + Member, later calls return the same Household. Concurrent first sign-ins are made
 * safe by the unique `members.auth_user_id` constraint — a losing insert is caught and re-read.
 */

type Db = NodePgDatabase<typeof schema>;

export interface Membership {
  householdId: string;
  memberId: string;
}

async function findMembership(db: Db, authUserId: string): Promise<Membership | undefined> {
  const [member] = await db.select().from(members).where(eq(members.authUserId, authUserId));
  return member ? { householdId: member.householdId, memberId: member.id } : undefined;
}

/** The Household for a signed-in user, creating it (and the Member) on first call. */
export async function ensureHouseholdForUser(db: Db, authUserId: string): Promise<Membership> {
  const existing = await findMembership(db, authUserId);
  if (existing) return existing;

  try {
    return await db.transaction(async (tx) => {
      const [household] = await tx.insert(households).values({}).returning();
      const [member] = await tx
        .insert(members)
        .values({ householdId: household.id, authUserId })
        .returning();
      return { householdId: household.id, memberId: member.id };
    });
  } catch (err) {
    // A concurrent first sign-in won the race and inserted the Member first (unique violation).
    const raced = await findMembership(db, authUserId);
    if (raced) return raced;
    throw err;
  }
}
