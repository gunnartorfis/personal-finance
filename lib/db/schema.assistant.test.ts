import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { assistantConversations, assistantMessages, households, members } from "./schema";

const NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000";

function freshDb() {
  return drizzle(new PGlite(), {
    schema: { households, members, assistantConversations, assistantMessages },
  });
}

/** Seed a Household with one Member; returns both ids. */
async function seed(db: ReturnType<typeof freshDb>, authUserId: string) {
  const [hh] = await db.insert(households).values({}).returning();
  const [member] = await db
    .insert(members)
    .values({ householdId: hh.id, authUserId })
    .returning();
  return { householdId: hh.id, memberId: member.id };
}

describe("assistant schema", () => {
  let db: ReturnType<typeof freshDb>;

  beforeAll(async () => {
    db = freshDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("stores a conversation attributed to its starter, with a title", async () => {
    const { householdId, memberId } = await seed(db, "starter-1");
    const [conv] = await db
      .insert(assistantConversations)
      .values({ householdId, startedByMemberId: memberId, title: "Why was March higher?" })
      .returning();
    expect(conv.householdId).toBe(householdId);
    expect(conv.startedByMemberId).toBe(memberId);
    expect(conv.title).toBe("Why was March higher?");
    expect(conv.createdAt).toBeInstanceOf(Date);
  });

  it("stores a user message (attributed) and an assistant message (unattributed)", async () => {
    const { householdId, memberId } = await seed(db, "starter-2");
    const [conv] = await db
      .insert(assistantConversations)
      .values({ householdId, startedByMemberId: memberId, title: "March" })
      .returning();

    const [userMsg] = await db
      .insert(assistantMessages)
      .values({
        householdId,
        conversationId: conv.id,
        memberId,
        role: "user",
        content: "Why was March higher?",
      })
      .returning();
    const [assistantMsg] = await db
      .insert(assistantMessages)
      .values({
        householdId,
        conversationId: conv.id,
        memberId: null,
        role: "assistant",
        content: "March spending rose 18% driven by Nice to have.",
      })
      .returning();

    expect(userMsg.role).toBe("user");
    expect(userMsg.memberId).toBe(memberId);
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.memberId).toBeNull();
  });

  it("rejects an assistant message that carries a member attribution (CHECK)", async () => {
    const { householdId, memberId } = await seed(db, "starter-3");
    const [conv] = await db
      .insert(assistantConversations)
      .values({ householdId, startedByMemberId: memberId, title: "x" })
      .returning();
    await expect(
      db.insert(assistantMessages).values({
        householdId,
        conversationId: conv.id,
        memberId,
        role: "assistant",
        content: "should not be attributed",
      }),
    ).rejects.toThrow();
  });

  it("rejects an unknown role (CHECK)", async () => {
    const { householdId, memberId } = await seed(db, "starter-4");
    const [conv] = await db
      .insert(assistantConversations)
      .values({ householdId, startedByMemberId: memberId, title: "x" })
      .returning();
    // Cast past the enum type to send a value the DB enum must reject at runtime.
    const invalid = {
      householdId,
      conversationId: conv.id,
      memberId: null,
      role: "system",
      content: "nope",
    } as unknown as typeof assistantMessages.$inferInsert;
    await expect(db.insert(assistantMessages).values(invalid)).rejects.toThrow();
  });

  it("rejects a message whose conversation lives in another household (composite FK)", async () => {
    const a = await seed(db, "starter-5a");
    const b = await seed(db, "starter-5b");
    const [convA] = await db
      .insert(assistantConversations)
      .values({ householdId: a.householdId, startedByMemberId: a.memberId, title: "a" })
      .returning();
    // Claim conversation A under household B — tenant crossing must be rejected by the composite FK.
    await expect(
      db.insert(assistantMessages).values({
        householdId: b.householdId,
        conversationId: convA.id,
        memberId: null,
        role: "assistant",
        content: "cross-tenant",
      }),
    ).rejects.toThrow();
  });

  it("cascades: deleting a conversation deletes its messages", async () => {
    const { householdId, memberId } = await seed(db, "starter-6");
    const [conv] = await db
      .insert(assistantConversations)
      .values({ householdId, startedByMemberId: memberId, title: "x" })
      .returning();
    await db.insert(assistantMessages).values({
      householdId,
      conversationId: conv.id,
      memberId,
      role: "user",
      content: "q",
    });
    await db.delete(assistantConversations).where(eq(assistantConversations.id, conv.id));
    const remaining = await db
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.conversationId, conv.id));
    expect(remaining).toHaveLength(0);
  });

  it("rejects a conversation whose household does not exist (FK)", async () => {
    await expect(
      db
        .insert(assistantConversations)
        .values({ householdId: NONEXISTENT_ID, startedByMemberId: null, title: "orphan" }),
    ).rejects.toThrow();
  });
});
