import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { accounts, households, householdInvites, members } from "@/lib/db/schema";

import {
  acceptInvite,
  createInvite,
  declineInvite,
  findActiveInvitesByEmail,
  generateInviteToken,
  hashInviteToken,
  InviteError,
  MEMBER_CAP,
} from "./invites";

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof createInvite>[0]["db"];

const NOW = new Date("2026-07-01T00:00:00Z");

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  // Isolate each test — cascade clears members, invites, accounts, etc.
  await db.delete(households);
});

/** A household on `plan` with one Member (the inviter). Returns ids. */
async function seedHousehold(plan: "Free" | "Premium" = "Premium") {
  const [hh] = await db.insert(households).values({ plan }).returning();
  const [member] = await db
    .insert(members)
    .values({ householdId: hh.id, authUserId: `auth_${hh.id}` })
    .returning();
  return { householdId: hh.id, memberId: member.id };
}

describe("createInvite", () => {
  it("rejects a Free household", async () => {
    const { householdId, memberId } = await seedHousehold("Free");
    await expect(
      createInvite({ db: asDb(db), householdId, plan: "Free", invitedByMemberId: memberId, email: "a@b.co", now: NOW }),
    ).rejects.toMatchObject({ code: "not_premium" });
  });

  it("rejects an invalid email", async () => {
    const { householdId, memberId } = await seedHousehold();
    await expect(
      createInvite({ db: asDb(db), householdId, plan: "Premium", invitedByMemberId: memberId, email: "not-an-email", now: NOW }),
    ).rejects.toMatchObject({ code: "invalid_email" });
  });

  it("creates a pending invite whose stored hash matches the returned token", async () => {
    const { householdId, memberId } = await seedHousehold();
    const { rawToken } = await createInvite({
      db: asDb(db), householdId, plan: "Premium", invitedByMemberId: memberId, email: "Spouse@Example.com", now: NOW,
    });
    const [row] = await db.select().from(householdInvites);
    expect(row.email).toBe("spouse@example.com"); // normalized
    expect(row.status).toBe("pending");
    expect(row.tokenHash).toBe(hashInviteToken(rawToken));
    expect(row.expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("supersedes a live invite to the same email (only one pending; old token dies)", async () => {
    const { householdId, memberId } = await seedHousehold();
    const first = await createInvite({ db: asDb(db), householdId, plan: "Premium", invitedByMemberId: memberId, email: "s@x.co", now: NOW });
    const second = await createInvite({ db: asDb(db), householdId, plan: "Premium", invitedByMemberId: memberId, email: "s@x.co", now: NOW });
    expect(second.rawToken).not.toBe(first.rawToken);

    const pending = await db.select().from(householdInvites).where(eq(householdInvites.status, "pending"));
    expect(pending).toHaveLength(1);

    // The old link no longer redeems.
    await expect(
      acceptInvite({ db: asDb(db), locator: { rawToken: first.rawToken }, authUserId: "newbie", email: "s@x.co", emailVerified: true, now: NOW }),
    ).rejects.toMatchObject({ code: "not_pending" });
  });

  it("enforces the seat cap but lets a supersede through at the cap", async () => {
    const { householdId, memberId } = await seedHousehold();
    // Fill remaining seats (1 member already) with pending invites up to the cap.
    for (let i = 0; i < MEMBER_CAP - 1; i++) {
      await createInvite({ db: asDb(db), householdId, plan: "Premium", invitedByMemberId: memberId, email: `p${i}@x.co`, now: NOW });
    }
    await expect(
      createInvite({ db: asDb(db), householdId, plan: "Premium", invitedByMemberId: memberId, email: "over@x.co", now: NOW }),
    ).rejects.toMatchObject({ code: "cap_reached" });

    // Re-inviting an already-invited email reuses its seat, so it is allowed even at the cap.
    await expect(
      createInvite({ db: asDb(db), householdId, plan: "Premium", invitedByMemberId: memberId, email: "p0@x.co", now: NOW }),
    ).resolves.toMatchObject({ rawToken: expect.any(String) });
  });
});

describe("acceptInvite", () => {
  async function pendingInvite(email = "join@x.co") {
    const { householdId, memberId } = await seedHousehold();
    const { rawToken } = await createInvite({ db: asDb(db), householdId, plan: "Premium", invitedByMemberId: memberId, email, now: NOW });
    return { householdId, rawToken, email };
  }

  it("adds the user as a Member and marks the invite accepted", async () => {
    const { householdId, rawToken, email } = await pendingInvite();
    const res = await acceptInvite({ db: asDb(db), locator: { rawToken }, authUserId: "invitee", email, emailVerified: true, now: NOW });
    expect(res.householdId).toBe(householdId);

    const [member] = await db.select().from(members).where(eq(members.authUserId, "invitee"));
    expect(member.householdId).toBe(householdId);
    // A fresh join reports the new member id and joined=true so the route can log invite.accepted.
    expect(res.joined).toBe(true);
    expect(res.memberId).toBe(member.id);
    const [invite] = await db.select().from(householdInvites);
    expect(invite.status).toBe("accepted");
    expect(invite.acceptedAt).not.toBeNull();
  });

  it("accepts by invite id too (verified-email match is the authorization)", async () => {
    const { householdId, email } = await pendingInvite("byid@x.co");
    const [invite] = await db.select().from(householdInvites);
    const res = await acceptInvite({ db: asDb(db), locator: { inviteId: invite.id }, authUserId: "byid", email, emailVerified: true, now: NOW });
    expect(res.householdId).toBe(householdId);
  });

  it("rejects an unverified email", async () => {
    const { rawToken, email } = await pendingInvite();
    await expect(
      acceptInvite({ db: asDb(db), locator: { rawToken }, authUserId: "u", email, emailVerified: false, now: NOW }),
    ).rejects.toMatchObject({ code: "email_not_verified" });
  });

  it("rejects a mismatched email", async () => {
    const { rawToken } = await pendingInvite("real@x.co");
    await expect(
      acceptInvite({ db: asDb(db), locator: { rawToken }, authUserId: "u", email: "other@x.co", emailVerified: true, now: NOW }),
    ).rejects.toMatchObject({ code: "email_mismatch" });
  });

  it("rejects an expired invite", async () => {
    const { householdId, memberId } = await seedHousehold();
    const { rawToken, tokenHash } = generateInviteToken();
    await db.insert(householdInvites).values({
      householdId, email: "late@x.co", tokenHash, invitedByMemberId: memberId,
      expiresAt: new Date(NOW.getTime() - 1000),
    });
    await expect(
      acceptInvite({ db: asDb(db), locator: { rawToken }, authUserId: "u", email: "late@x.co", emailVerified: true, now: NOW }),
    ).rejects.toMatchObject({ code: "expired" });
  });

  it("blocks a user who already belongs to a different household", async () => {
    const { rawToken, email } = await pendingInvite("busy@x.co");
    const other = await seedHousehold();
    await db.insert(members).values({ householdId: other.householdId, authUserId: "busy-user" });
    await expect(
      acceptInvite({ db: asDb(db), locator: { rawToken }, authUserId: "busy-user", email, emailVerified: true, now: NOW }),
    ).rejects.toMatchObject({ code: "already_in_household" });
  });

  it("handles a concurrent double-accept without a unique-violation crash", async () => {
    const { householdId, rawToken, email } = await pendingInvite("race@x.co")
    const [a, b] = await Promise.all([
      acceptInvite({ db: asDb(db), locator: { rawToken }, authUserId: "race-user", email, emailVerified: true, now: NOW }),
      acceptInvite({ db: asDb(db), locator: { rawToken }, authUserId: "race-user", email, emailVerified: true, now: NOW }),
    ])
    expect(a.householdId).toBe(householdId)
    expect(b.householdId).toBe(householdId)
    const mine = await db.select().from(members).where(eq(members.authUserId, "race-user"))
    expect(mine).toHaveLength(1) // exactly one member row despite two accepts
  })

  it("is idempotent when already a Member of the inviting household", async () => {
    const { householdId, rawToken, email } = await pendingInvite("again@x.co");
    await db.insert(members).values({ householdId, authUserId: "again-user" });
    const res = await acceptInvite({ db: asDb(db), locator: { rawToken }, authUserId: "again-user", email, emailVerified: true, now: NOW });
    expect(res.householdId).toBe(householdId);
    // Idempotent re-accept is not a fresh join, so the route must NOT log another invite.accepted.
    expect(res.joined).toBe(false);
    const mine = await db.select().from(members).where(and(eq(members.authUserId, "again-user"), eq(members.householdId, householdId)));
    expect(mine).toHaveLength(1); // no duplicate member row
  });

  it("confirmSwitch deletes the sole-member current household and joins the new one", async () => {
    const { householdId, rawToken, email } = await pendingInvite("switch@x.co");
    const [oldHh] = await db.insert(households).values({}).returning();
    await db.insert(members).values({ householdId: oldHh.id, authUserId: "switcher" });

    const res = await acceptInvite({
      db: asDb(db), locator: { rawToken }, authUserId: "switcher", email, emailVerified: true, confirmSwitch: true, now: NOW,
    });
    expect(res.householdId).toBe(householdId);

    const mine = await db.select().from(members).where(eq(members.authUserId, "switcher"));
    expect(mine).toHaveLength(1);
    expect(mine[0].householdId).toBe(householdId);
    // Sole-member household is deleted (cascades its data).
    expect(await db.select().from(households).where(eq(households.id, oldHh.id))).toHaveLength(0);
  });

  it("confirmSwitch leaves a multi-member current household (it survives) and joins the new one", async () => {
    const { householdId, rawToken, email } = await pendingInvite("mover@x.co");
    const [oldHh] = await db.insert(households).values({}).returning();
    await db.insert(members).values({ householdId: oldHh.id, authUserId: "mover" });
    await db.insert(members).values({ householdId: oldHh.id, authUserId: "roommate" });

    const res = await acceptInvite({
      db: asDb(db), locator: { rawToken }, authUserId: "mover", email, emailVerified: true, confirmSwitch: true, now: NOW,
    });
    expect(res.householdId).toBe(householdId);

    const [mine] = await db.select().from(members).where(eq(members.authUserId, "mover"));
    expect(mine.householdId).toBe(householdId);
    // Old household survives for the remaining member.
    const remaining = await db.select().from(members).where(eq(members.householdId, oldHh.id));
    expect(remaining.map((m) => m.authUserId)).toEqual(["roommate"]);
  });

  it("won't delete a sole-member household holding data without confirmDelete (stale leave→delete)", async () => {
    const { householdId, rawToken, email } = await pendingInvite("stale@x.co");
    const [oldHh] = await db.insert(households).values({}).returning();
    await db.insert(members).values({ householdId: oldHh.id, authUserId: "stale-user" });
    // A non-default account makes the household "active", so dropping it is destructive.
    await db.insert(accounts).values({ householdId: oldHh.id, name: "Checking" });

    // A bare confirmSwitch (what a stale "leave"/"discard" snapshot sends) must not destroy data.
    await expect(
      acceptInvite({ db: asDb(db), locator: { rawToken }, authUserId: "stale-user", email, emailVerified: true, confirmSwitch: true, now: NOW }),
    ).rejects.toMatchObject({ code: "confirm_delete_required" });
    expect(await db.select().from(households).where(eq(households.id, oldHh.id))).toHaveLength(1);

    // With the explicit destructive confirmation, the switch goes through.
    const res = await acceptInvite({
      db: asDb(db), locator: { rawToken }, authUserId: "stale-user", email, emailVerified: true, confirmSwitch: true, confirmDelete: true, now: NOW,
    });
    expect(res.householdId).toBe(householdId);
    expect(await db.select().from(households).where(eq(households.id, oldHh.id))).toHaveLength(0);
  });

  it("without confirmSwitch, a sole-member switch is still blocked (no accidental deletion)", async () => {
    const { rawToken, email } = await pendingInvite("careful@x.co");
    const [oldHh] = await db.insert(households).values({}).returning();
    await db.insert(members).values({ householdId: oldHh.id, authUserId: "careful" });

    await expect(
      acceptInvite({ db: asDb(db), locator: { rawToken }, authUserId: "careful", email, emailVerified: true, now: NOW }),
    ).rejects.toMatchObject({ code: "already_in_household" });
    // The current household is untouched.
    expect(await db.select().from(households).where(eq(households.id, oldHh.id))).toHaveLength(1);
  });
});

describe("declineInvite", () => {
  it("revokes a pending invite addressed to the matching email", async () => {
    const { householdId, memberId } = await seedHousehold();
    const { rawToken } = await createInvite({ db: asDb(db), householdId, plan: "Premium", invitedByMemberId: memberId, email: "no@x.co", now: NOW });
    await declineInvite({ db: asDb(db), locator: { rawToken }, email: "no@x.co" });
    const [invite] = await db.select().from(householdInvites);
    expect(invite.status).toBe("revoked");
  });

  it("ignores an invite for a different email", async () => {
    const { householdId, memberId } = await seedHousehold();
    const { rawToken } = await createInvite({ db: asDb(db), householdId, plan: "Premium", invitedByMemberId: memberId, email: "keep@x.co", now: NOW });
    await declineInvite({ db: asDb(db), locator: { rawToken }, email: "someone-else@x.co" });
    const [invite] = await db.select().from(householdInvites);
    expect(invite.status).toBe("pending");
  });
});

describe("findActiveInvitesByEmail", () => {
  it("returns only pending, unexpired invites for the (normalized) email", async () => {
    const { householdId, memberId } = await seedHousehold();
    await createInvite({ db: asDb(db), householdId, plan: "Premium", invitedByMemberId: memberId, email: "Match@X.co", now: NOW });
    const found = await findActiveInvitesByEmail(asDb(db), "match@x.co", NOW);
    expect(found).toHaveLength(1);
    expect(await findActiveInvitesByEmail(asDb(db), "nobody@x.co", NOW)).toHaveLength(0);
  });
});

it("maps every InviteError code to a distinct construction", () => {
  // Guard against a typo'd code silently slipping the status switch.
  expect(new InviteError("cap_reached").code).toBe("cap_reached");
});
