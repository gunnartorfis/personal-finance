import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  accounts,
  assistantConversations,
  assistantMessages,
  households,
  householdInvites,
  members,
  uploads,
} from "@/lib/db/schema";
import { generateInviteToken } from "@/lib/household/invites";

import { deleteHousehold, leaveHousehold, LeaveError } from "./membership";

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof leaveHousehold>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  await db.delete(households);
});

async function seedMember(householdId: string, authUserId: string) {
  const [m] = await db.insert(members).values({ householdId, authUserId }).returning();
  return m.id;
}

describe("leaveHousehold", () => {
  it("refuses to let the sole Member leave (they must delete instead)", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    const memberId = await seedMember(hh.id, "solo");
    await expect(leaveHousehold(asDb(db), hh.id, memberId)).rejects.toBeInstanceOf(LeaveError);
    const remaining = await db.select().from(members).where(eq(members.householdId, hh.id));
    expect(remaining).toHaveLength(1); // still there
  });

  it("removes a Member when others remain and nulls their actor references", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    const leaver = await seedMember(hh.id, "leaver");
    await seedMember(hh.id, "stayer");
    const [acct] = await db.insert(accounts).values({ householdId: hh.id, name: "Visa" }).returning();
    const [upload] = await db
      .insert(uploads)
      .values({ householdId: hh.id, accountId: acct.id, importedByMemberId: leaver, fileName: "s.csv", fileHash: "h1" })
      .returning();
    const { tokenHash } = generateInviteToken();
    const [invite] = await db
      .insert(householdInvites)
      .values({ householdId: hh.id, email: "x@y.co", tokenHash, invitedByMemberId: leaver, expiresAt: new Date("2099-01-01") })
      .returning();

    await leaveHousehold(asDb(db), hh.id, leaver);

    expect(await db.select().from(members).where(eq(members.id, leaver))).toHaveLength(0);
    const [u] = await db.select().from(uploads).where(eq(uploads.id, upload.id));
    expect(u.importedByMemberId).toBeNull(); // reference nulled, upload kept
    const [i] = await db.select().from(householdInvites).where(eq(householdInvites.id, invite.id));
    expect(i.invitedByMemberId).toBeNull();
  });

  it("nulls a leaver's upload-undo attribution so departure never hits an FK violation (ADR-0024)", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    const leaver = await seedMember(hh.id, "undoer");
    await seedMember(hh.id, "stayer");
    const [acct] = await db.insert(accounts).values({ householdId: hh.id, name: "Visa" }).returning();
    // An upload this member undid: undone_by points at the leaver (NO ACTION composite FK).
    const [upload] = await db
      .insert(uploads)
      .values({
        householdId: hh.id,
        accountId: acct.id,
        fileName: "u.csv",
        fileHash: "undo-fk",
        undoneAt: new Date("2026-07-24T00:00:00Z"),
        undoneByMemberId: leaver,
      })
      .returning();
    await leaveHousehold(asDb(db), hh.id, leaver);
    const [u] = await db.select().from(uploads).where(eq(uploads.id, upload.id));
    expect(u.undoneByMemberId).toBeNull(); // attribution nulled, upload kept
    expect(u.undoneAt).not.toBeNull(); // the undo itself stands
  });

  it("nulls a leaver's Assistant attributions so departure never hits an FK violation (#101)", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    const leaver = await seedMember(hh.id, "assistant-leaver");
    await seedMember(hh.id, "assistant-stayer");
    // The leaver opened a thread and asked a question — both carry NO-ACTION member FKs.
    const [conv] = await db
      .insert(assistantConversations)
      .values({ householdId: hh.id, startedByMemberId: leaver, title: "Why was March higher?" })
      .returning();
    const [msg] = await db
      .insert(assistantMessages)
      .values({ householdId: hh.id, conversationId: conv.id, memberId: leaver, role: "user", content: "q" })
      .returning();

    await leaveHousehold(asDb(db), hh.id, leaver);

    // The member is gone; their threads/messages survive with attribution nulled (Household-owned).
    expect(await db.select().from(members).where(eq(members.id, leaver))).toHaveLength(0);
    const [c] = await db.select().from(assistantConversations).where(eq(assistantConversations.id, conv.id));
    expect(c.startedByMemberId).toBeNull();
    const [m] = await db.select().from(assistantMessages).where(eq(assistantMessages.id, msg.id));
    expect(m.memberId).toBeNull();
  });
});

describe("deleteHousehold", () => {
  it("removes the household and cascades its members, accounts, and invites", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    await seedMember(hh.id, "a");
    await db.insert(accounts).values({ householdId: hh.id, name: "Visa" });
    const { tokenHash } = generateInviteToken();
    await db.insert(householdInvites).values({ householdId: hh.id, email: "z@y.co", tokenHash, expiresAt: new Date("2099-01-01") });

    await deleteHousehold(asDb(db), hh.id);

    expect(await db.select().from(households).where(eq(households.id, hh.id))).toHaveLength(0);
    expect(await db.select().from(members).where(eq(members.householdId, hh.id))).toHaveLength(0);
    expect(await db.select().from(accounts).where(eq(accounts.householdId, hh.id))).toHaveLength(0);
    expect(await db.select().from(householdInvites).where(eq(householdInvites.householdId, hh.id))).toHaveLength(0);
  });
});
