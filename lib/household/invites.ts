import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { householdInvites, members } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import type { Plan } from "@/shared/types";

import { getHouseholdActivity } from "./activity";
import { switchOutOfHousehold } from "./membership";

/**
 * Household Invite domain logic (ADR-0010).
 *
 * App-owned invites: the Household DB row is the single source of truth (we do NOT use Neon Auth's
 * organization plugin). An Invite is created by a Member of a **Premium** Household, delivered as a
 * link carrying a raw token (only its SHA-256 is stored), and redeemed by a signed-in user whose
 * **verified** email matches — adding a Member to the *existing* Household. A user already in a
 * Household must leave it first; joining a second is rejected (one Household per Member, v1).
 *
 * These functions take a `Db` directly (not a household-scoped repo): accept/lookup happen before
 * the redeemer is bound to any tenant, so they are inherently cross-Household and can't ride the
 * repo's tenant scoping. Creation IS Household-scoped and reuses the repo where the route has one.
 */

type Db = NodePgDatabase<typeof schema>;

/** How long an Invite stays redeemable before it expires (ADR-0010). */
export const INVITE_TTL_DAYS = 7;

/** Max Members per Household, counting active (pending) Invites as reserved seats (ADR-0010). */
export const MEMBER_CAP = 10;

/** Machine-readable failure reasons, mapped to HTTP status by the route layer. */
export type InviteErrorCode =
  | "not_premium"
  | "cap_reached"
  | "invalid_email"
  | "not_found"
  | "not_pending"
  | "expired"
  | "email_mismatch"
  | "email_not_verified"
  | "already_in_household"
  | "confirm_delete_required";

/** A domain failure in the Invite flow; `code` drives the API status + message. */
export class InviteError extends Error {
  constructor(
    readonly code: InviteErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "InviteError";
  }
}

/** HTTP status for each Invite failure — keeps the route layer free of a big switch. */
export function inviteErrorStatus(code: InviteErrorCode): number {
  switch (code) {
    case "invalid_email":
      return 400;
    case "not_premium":
    case "email_mismatch":
    case "email_not_verified":
      return 403;
    case "not_found":
      return 404;
    case "not_pending":
    case "cap_reached":
    case "already_in_household":
    case "confirm_delete_required":
      return 409;
    case "expired":
      return 410;
  }
}

/** Normalize an email to the stored form: trimmed + lower-cased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Deliberately permissive: real deliverability is proven by the redeemer signing in with the
// address, not by our regex. This only rejects obvious garbage before we store it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A fresh random invite token (raw, for the link) and its stored SHA-256 hash. */
export function generateInviteToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashInviteToken(rawToken) };
}

/** SHA-256 (hex) of a raw invite token — the only form persisted. */
export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface CreateInviteInput {
  db: Db;
  householdId: string;
  /** The Household's Plan; inviting requires `Premium` (ADR-0010). */
  plan: Plan;
  /** The Member issuing the Invite (recorded as `invitedByMemberId`). */
  invitedByMemberId: string;
  email: string;
  now: Date;
}

/**
 * Issue an Invite for `email`. Requires Premium and a free seat (Members + active Invites < cap).
 * Re-inviting an email that already has a live Invite **supersedes** it (the old link stops working
 * and a new one is returned) rather than erroring — so the inviter always gets a working link, and
 * the reused seat means it never trips the cap. Returns the raw token for building the link.
 */
export async function createInvite(
  input: CreateInviteInput,
): Promise<{ inviteId: string; rawToken: string; expiresAt: Date }> {
  const { db, householdId, plan, invitedByMemberId, now } = input;
  if (plan !== "Premium") throw new InviteError("not_premium");

  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) throw new InviteError("invalid_email");

  const { rawToken, tokenHash } = generateInviteToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const inviteId = await db.transaction(async (tx) => {
    // A live Invite already addressed to this email reuses its reserved seat when superseded.
    const [existing] = await tx
      .select({ id: householdInvites.id })
      .from(householdInvites)
      .where(
        and(
          eq(householdInvites.householdId, householdId),
          eq(householdInvites.email, email),
          eq(householdInvites.status, "pending"),
          gt(householdInvites.expiresAt, sql`now()`),
        ),
      );

    const seatsUsed = (await countMembers(tx, householdId)) + (await countActiveInvites(tx, householdId));
    // Superseding reuses the existing seat, so only a genuinely new seat is capped.
    if (!existing && seatsUsed >= MEMBER_CAP) throw new InviteError("cap_reached");

    if (existing) {
      await tx
        .update(householdInvites)
        .set({ status: "revoked" })
        .where(eq(householdInvites.id, existing.id));
    }

    const [row] = await tx
      .insert(householdInvites)
      .values({ householdId, email, tokenHash, invitedByMemberId, expiresAt })
      .returning({ id: householdInvites.id });
    if (!row) throw new Error("invite insert returned no row");
    return row.id;
  });

  return { inviteId, rawToken, expiresAt };
}

/**
 * Active (pending, unexpired) Invites addressed to `email`, across ALL Households — the provisioning
 * intercept and the `/join` screen use this to route a signing-in invitee instead of auto-creating
 * them a stray Household (ADR-0010).
 */
export async function findActiveInvitesByEmail(db: Db, email: string) {
  return db
    .select()
    .from(householdInvites)
    .where(
      and(
        eq(householdInvites.email, normalizeEmail(email)),
        eq(householdInvites.status, "pending"),
        gt(householdInvites.expiresAt, sql`now()`),
      ),
    );
}

/** How the redeemer located the Invite: a `rawToken` from the link, or an `inviteId` from `/join`. */
export type InviteLocator = { rawToken: string } | { inviteId: string };

/**
 * Minimal, unauthenticated-safe view of an Invite for the `/join/[token]` screen: enough to tell
 * the user which email to sign in with, whether the link is still good, and (via
 * {@link getInviteCardDetails}) who invited them. Returns `null` for an unknown token. Possession of
 * the (unguessable) token is the only gate to reading this.
 */
export async function getInvitePreviewByToken(
  db: Db,
  rawToken: string,
): Promise<{
  email: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: Date;
  householdId: string;
  invitedByMemberId: string | null;
} | null> {
  const [invite] = await db
    .select({
      email: householdInvites.email,
      status: householdInvites.status,
      expiresAt: householdInvites.expiresAt,
      householdId: householdInvites.householdId,
      invitedByMemberId: householdInvites.invitedByMemberId,
    })
    .from(householdInvites)
    .where(eq(householdInvites.tokenHash, hashInviteToken(rawToken)));
  return invite ?? null;
}

/** Human context for the invite-acceptance card: who invited you, and how many people you'd join. */
export interface InviteCardDetails {
  inviterName: string | null;
  inviterEmail: string | null;
  /** Current Members of the inviting Household (the invitee is not yet counted). */
  memberCount: number;
}

/**
 * Resolve the display context for an Invite: the inviter's identity and the Household's current
 * size. Inviter name/email live in Neon Auth's `users_sync` mirror (not on `members`), so this joins
 * there and degrades gracefully — a missing mirror or a since-departed inviter yields a null
 * identity, and the card falls back to generic copy rather than failing.
 */
export async function getInviteCardDetails(
  db: Db,
  householdId: string,
  invitedByMemberId: string | null,
): Promise<InviteCardDetails> {
  if (!invitedByMemberId) {
    return { inviterName: null, inviterEmail: null, memberCount: await countMembers(db, householdId) };
  }

  // The count and the identity join are independent — run them together. The identity join is the
  // fragile one (a missing `users_sync` mirror throws), so it catches to a null identity rather than
  // failing the whole card. `m.household_id` is asserted too, so the row is self-validating: an
  // inviter who has since left this Household resolves to null, not a stale name.
  const [memberCount, inviter] = await Promise.all([
    countMembers(db, householdId),
    db
      .execute<{ name: string | null; email: string | null }>(sql`
        select u.name, u.email
        from members m
        left join neon_auth.users_sync u on u.id = m.auth_user_id
        where m.id = ${invitedByMemberId} and m.household_id = ${householdId}
        limit 1
      `)
      .then((result) => result.rows[0] ?? null)
      .catch(() => null),
  ]);

  return { inviterName: inviter?.name ?? null, inviterEmail: inviter?.email ?? null, memberCount };
}

export interface AcceptInviteInput {
  db: Db;
  locator: InviteLocator;
  authUserId: string;
  /** The redeemer's session email and whether Neon Auth has verified it. */
  email: string;
  emailVerified: boolean;
  /**
   * The redeemer has explicitly confirmed switching out of their current Household in order to join
   * this one. Without it, an accepter already in a *different* Household is rejected with
   * `already_in_household`.
   */
  confirmSwitch?: boolean;
  /**
   * The redeemer has confirmed the *destructive* case: deleting their current Household (they're its
   * sole Member) along with all of its data. Required whenever the switch would actually destroy a
   * Household that holds data — a guard against a stale "leave" snapshot silently escalating to a
   * delete if the other Members left between page render and submit. Not needed to drop a pristine,
   * empty starter Household.
   */
  confirmDelete?: boolean;
  now: Date;
}

/**
 * Redeem an Invite: validate it, enforce the verified-email match and the one-Household rule, then
 * add the signing-in user as a Member of the Invite's Household and mark the Invite accepted —
 * atomically. Works from either the link's raw token or an invite id surfaced on `/join`; the
 * **verified-email match is the authorization** in both cases (the token only proves link
 * possession), so accept-by-id is equally safe. Returns the joined `householdId`, the accepter's
 * `memberId`, and `joined` — true only on a genuine fresh insert (false on an idempotent re-accept
 * or the losing side of a parallel race), so the caller logs `invite.accepted` exactly once.
 *
 * One-Household rule (ADR-0010): a user already in the *same* Household is a no-op (idempotent). One
 * in a *different* Household must opt into a switch — with `confirmSwitch`, their current Household is
 * cleared first ({@link switchOutOfHousehold}: deleted if they're its sole Member, otherwise left)
 * inside this same transaction, so the whole switch is all-or-nothing; without it, `already_in_household`.
 */
export async function acceptInvite(
  input: AcceptInviteInput,
): Promise<{ householdId: string; memberId: string; joined: boolean }> {
  const { db, locator, authUserId, now } = input;
  const email = normalizeEmail(input.email);

  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(householdInvites)
      .where(
        "rawToken" in locator
          ? eq(householdInvites.tokenHash, hashInviteToken(locator.rawToken))
          : eq(householdInvites.id, locator.inviteId),
      );
    if (!invite) throw new InviteError("not_found");

    // Membership is read BEFORE Invite status so a repeat accept is idempotent: a double-submit
    // (the common double-click, where the first request already made them a Member, or a true
    // parallel race) resolves to success rather than a confusing `not_pending` on the second call.
    const [existingMembership] = await tx
      .select({ householdId: members.householdId, memberId: members.id })
      .from(members)
      .where(eq(members.authUserId, authUserId));

    // Already a Member of this exact Household — settle a still-pending Invite and no-op the join.
    if (existingMembership?.householdId === invite.householdId) {
      if (invite.status === "pending") await markAccepted(tx, invite.id, now);
      // Not a fresh join — the caller must not log another invite.accepted.
      return { householdId: invite.householdId, memberId: existingMembership.memberId, joined: false };
    }

    // Join (fresh or via a switch): the Invite must be live and addressed to this verified email.
    // Validate fully BEFORE touching the current Household, so a rejected accept never destroys it.
    if (!input.emailVerified) throw new InviteError("email_not_verified");
    if (invite.status !== "pending") throw new InviteError("not_pending");
    if (invite.expiresAt.getTime() <= now.getTime()) throw new InviteError("expired");
    if (invite.email !== email) throw new InviteError("email_mismatch");
    if ((await countMembers(tx, invite.householdId)) >= MEMBER_CAP) {
      throw new InviteError("cap_reached");
    }

    // In a different Household already: only a confirmed switch clears it (delete if sole, else
    // leave). Re-derive the outcome from live state here, not from the client's page-render snapshot:
    // if the switch would now DELETE a Household that holds data, it must carry an explicit
    // `confirmDelete` — otherwise a "leave" the user saw (that became sole-Member since) could destroy
    // their data without the destructive confirmation. Dropping an empty starter Household needs no
    // such confirm (nothing is lost).
    if (existingMembership) {
      if (!input.confirmSwitch) throw new InviteError("already_in_household");
      const { memberCount, hasActivity } = await getHouseholdActivity(tx, existingMembership.householdId);
      const wouldDestroyData = memberCount <= 1 && hasActivity;
      if (wouldDestroyData && !input.confirmDelete) {
        throw new InviteError("confirm_delete_required");
      }
      await switchOutOfHousehold(tx, existingMembership.householdId, existingMembership.memberId);
    }

    // Idempotent insert so a true-parallel double-submit can't abort the transaction on the
    // `members.auth_user_id` unique constraint. A no-op insert means a racing accept won the seat:
    // reconcile against the membership that now exists rather than 500ing.
    const inserted = await tx
      .insert(members)
      .values({ householdId: invite.householdId, authUserId })
      .onConflictDoNothing({ target: members.authUserId })
      .returning({ memberId: members.id });

    let memberId: string;
    let joined: boolean;
    if (inserted.length > 0) {
      // We won the seat — a genuine fresh join, worth an invite.accepted log entry.
      memberId = inserted[0].memberId;
      joined = true;
    } else {
      // A racing accept created the member first; reconcile and let that winner do the logging.
      const [raced] = await tx
        .select({ householdId: members.householdId, memberId: members.id })
        .from(members)
        .where(eq(members.authUserId, authUserId));
      if (raced?.householdId !== invite.householdId) throw new InviteError("already_in_household");
      memberId = raced.memberId;
      joined = false;
    }

    await markAccepted(tx, invite.id, now);
    return { householdId: invite.householdId, memberId, joined };
  });
}

/**
 * Decline an Invite addressed to the current user: mark a still-pending Invite `revoked` so it stops
 * routing them to `/join` (ADR-0010). Authorized by the **email match** — the target may always
 * refuse their own Invite. A no-op if the Invite is missing, already settled, or for another email.
 */
export async function declineInvite(input: {
  db: Db;
  locator: InviteLocator;
  email: string;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  await input.db
    .update(householdInvites)
    .set({ status: "revoked" })
    .where(
      and(
        "rawToken" in input.locator
          ? eq(householdInvites.tokenHash, hashInviteToken(input.locator.rawToken))
          : eq(householdInvites.id, input.locator.inviteId),
        eq(householdInvites.email, email),
        eq(householdInvites.status, "pending"),
      ),
    );
}

async function markAccepted(db: Db, inviteId: string, now: Date): Promise<void> {
  await db
    .update(householdInvites)
    .set({ status: "accepted", acceptedAt: now })
    .where(eq(householdInvites.id, inviteId));
}

async function countMembers(db: Db, householdId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(members)
    .where(eq(members.householdId, householdId));
  return row?.value ?? 0;
}

async function countActiveInvites(db: Db, householdId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(householdInvites)
    .where(
      and(
        eq(householdInvites.householdId, householdId),
        eq(householdInvites.status, "pending"),
        gt(householdInvites.expiresAt, sql`now()`),
      ),
    );
  return row?.value ?? 0;
}
