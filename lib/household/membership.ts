import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  assistantConversations,
  assistantMessages,
  households,
  householdInvites,
  members,
  overrides,
  uploads,
} from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import { toLocale, type Locale } from "@/lib/i18n/config";

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
 * Detach a Member's row from a Household: null their actor references (upload importer, override
 * author, invite issuer, Assistant conversation opener + message author — composite FKs are NO
 * ACTION) so the row can go, then delete it. No
 * last-Member guard and no transaction of its own — the caller supplies both. Runs on a `Db` or a
 * transaction handle, so it composes inside a larger atomic operation (e.g. an Invite switch).
 */
async function releaseMembership(db: Db, householdId: string, memberId: string): Promise<void> {
  await db
    .update(uploads)
    .set({ importedByMemberId: null })
    .where(and(eq(uploads.householdId, householdId), eq(uploads.importedByMemberId, memberId)));
  await db
    .update(overrides)
    .set({ memberId: null })
    .where(and(eq(overrides.householdId, householdId), eq(overrides.memberId, memberId)));
  await db
    .update(householdInvites)
    .set({ invitedByMemberId: null })
    .where(
      and(
        eq(householdInvites.householdId, householdId),
        eq(householdInvites.invitedByMemberId, memberId),
      ),
    );
  // Assistant attributions (#101) are also NO-ACTION composite FKs; null them so the leaver's
  // threads/messages stay (Household-owned) with attribution cleared, and the member row can go.
  await db
    .update(assistantConversations)
    .set({ startedByMemberId: null })
    .where(
      and(
        eq(assistantConversations.householdId, householdId),
        eq(assistantConversations.startedByMemberId, memberId),
      ),
    );
  await db
    .update(assistantMessages)
    .set({ memberId: null })
    .where(
      and(eq(assistantMessages.householdId, householdId), eq(assistantMessages.memberId, memberId)),
    );
  await db.delete(members).where(and(eq(members.id, memberId), eq(members.householdId, householdId)));
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
    await releaseMembership(tx, householdId, memberId);
  });
}

/**
 * Clear a Member out of their current Household so they can join another (the Invite switch,
 * ADR-0010). The exit depends on who's left: the sole Member's departure would orphan the
 * Household's data, so the whole Household is deleted (cascading all of it); when others remain the
 * Member simply leaves and the Household stays with them. Takes a `Db`/transaction handle from the
 * caller — {@link acceptInvite} runs this inside the same transaction as the join, so a switch is
 * all-or-nothing. Assumes the destructive intent is already confirmed by the caller.
 */
export async function switchOutOfHousehold(
  db: Db,
  householdId: string,
  memberId: string,
): Promise<void> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(members)
    .where(eq(members.householdId, householdId));
  if ((row?.value ?? 0) <= 1) {
    await deleteHousehold(db, householdId);
    return;
  }
  await releaseMembership(db, householdId, memberId);
}

/**
 * Delete the entire Household and cascade all of its data. Irreversible; the caller MUST scope
 * `householdId` to the current tenant and confirm the destructive intent with the user first.
 */
export async function deleteHousehold(db: Db, householdId: string): Promise<void> {
  await db.delete(households).where(eq(households.id, householdId));
}

/** The Member's saved Locale for an auth user, or `null` if unset/unsupported/no Member yet. */
export async function findMemberLocale(
  db: Db,
  authUserId: string,
): Promise<Locale | null> {
  const [member] = await db
    .select({ locale: members.locale })
    .from(members)
    .where(eq(members.authUserId, authUserId));
  return member ? toLocale(member.locale) : null;
}

/** Persist a Member's chosen Locale. Scope `memberId` to the current tenant. */
export async function updateMemberLocale(
  db: Db,
  memberId: string,
  locale: Locale,
): Promise<void> {
  await db.update(members).set({ locale }).where(eq(members.id, memberId));
}
