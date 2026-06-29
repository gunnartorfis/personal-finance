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

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

/** Whether an error is a Postgres unique violation (drizzle may wrap the driver error in `cause`). */
function isUniqueViolation(err: unknown): boolean {
  const codeOf = (e: unknown): unknown =>
    typeof e === "object" && e !== null && "code" in e ? (e as { code?: unknown }).code : undefined;
  return (
    codeOf(err) === UNIQUE_VIOLATION ||
    codeOf((err as { cause?: unknown } | null)?.cause) === UNIQUE_VIOLATION
  );
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
      if (!household) throw new Error("household insert returned no row");
      const [member] = await tx
        .insert(members)
        .values({ householdId: household.id, authUserId })
        .returning();
      if (!member) throw new Error("member insert returned no row");
      return { householdId: household.id, memberId: member.id };
    });
  } catch (err) {
    // Only a unique violation means a concurrent first sign-in won the race; re-read and return
    // its Household. Any other error (deadlock, serialization, etc.) propagates unchanged.
    if (!isUniqueViolation(err)) throw err;
    const raced = await findMembership(db, authUserId);
    if (raced) return raced;
    throw err;
  }
}
