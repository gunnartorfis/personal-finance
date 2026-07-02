import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { households, householdInvites, members, overrides, uploads } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

/**
 * Leaving and deleting a Household (ADR-0010).
 *
 * Two distinct exits, because one Household per Member (v1) means an invitee with an existing
 * Household must clear it before joining another:
 * - **Leave** — only when other Members remain. The leaver's row is removed; the Household and its
 *   data stay with the rest (ADR-0002). Actor references (upload importer, override author, invite
 *   issuer) are nulled first, since those composite FKs are NO ACTION.
 * - **Delete Household** — removes the tenant and cascades ALL its data via the schema's
 *   `ON DELETE CASCADE` foreign keys. This is the sole/last Member's only exit; any Member may
 *   trigger it (all Members equal, ADR-0002). Webhook-sourced `straumur_payments` rows are NOT
 *   FK'd to the Household and are intentionally left as an orphan diagnostic/audit trail.
 */

type Db = NodePgDatabase<typeof schema>;

export type LeaveErrorCode = "last_member";

/** A domain failure while leaving a Household. */
export class LeaveError extends Error {
  constructor(readonly code: LeaveErrorCode) {
    super(code);
    this.name = "LeaveError";
  }
}

/**
 * Remove `memberId` from `householdId`. Throws `last_member` when they are the only Member — the
 * sole Member must {@link deleteHousehold} instead, so we never orphan a Household's data by a leave.
 */
export async function leaveHousehold(db: Db, householdId: string, memberId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(members)
      .where(eq(members.householdId, householdId));
    if ((row?.value ?? 0) <= 1) throw new LeaveError("last_member");

    // Null this Member's actor references so the row can be deleted (composite FKs are NO ACTION).
    await tx
      .update(uploads)
      .set({ importedByMemberId: null })
      .where(and(eq(uploads.householdId, householdId), eq(uploads.importedByMemberId, memberId)));
    await tx
      .update(overrides)
      .set({ memberId: null })
      .where(and(eq(overrides.householdId, householdId), eq(overrides.memberId, memberId)));
    await tx
      .update(householdInvites)
      .set({ invitedByMemberId: null })
      .where(
        and(
          eq(householdInvites.householdId, householdId),
          eq(householdInvites.invitedByMemberId, memberId),
        ),
      );

    await tx
      .delete(members)
      .where(and(eq(members.id, memberId), eq(members.householdId, householdId)));
  });
}

/**
 * Delete the entire Household and cascade all of its data. Irreversible; the caller MUST scope
 * `householdId` to the current tenant and confirm the destructive intent with the user first.
 */
export async function deleteHousehold(db: Db, householdId: string): Promise<void> {
  await db.delete(households).where(eq(households.id, householdId));
}
