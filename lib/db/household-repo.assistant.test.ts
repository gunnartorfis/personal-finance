import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households, members } from "@/lib/db/schema";

describe("assistant repo", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  async function freshHousehold(authUserId: string) {
    const [h] = await db.insert(households).values({}).returning();
    const [m] = await db
      .insert(members)
      .values({ householdId: h.id, authUserId })
      .returning();
    return { repo: householdRepo(asRepoDb(db), h.id), memberId: m.id };
  }

  it("creates a conversation attributed to its opener", async () => {
    const { repo, memberId } = await freshHousehold("a");
    const conv = await repo.assistant.createConversation({
      startedByMemberId: memberId,
      title: "Why was March higher?",
    });
    expect(conv.title).toBe("Why was March higher?");
    expect(conv.startedByMemberId).toBe(memberId);
  });

  it("appends messages and loads a thread in chronological order", async () => {
    const { repo, memberId } = await freshHousehold("b");
    const conv = await repo.assistant.createConversation({ startedByMemberId: memberId, title: "t" });
    await repo.assistant.appendMessage({
      conversationId: conv.id,
      memberId,
      role: "user",
      content: "Why was March higher?",
    });
    await repo.assistant.appendMessage({
      conversationId: conv.id,
      memberId: null,
      role: "assistant",
      content: "Nice to have rose.",
    });
    const thread = await repo.assistant.listMessages(conv.id);
    expect(thread.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(thread[0].content).toBe("Why was March higher?");
    expect(thread[1].memberId).toBeNull();
  });

  it("lists conversations newest-activity first and bumps updatedAt on append", async () => {
    const { repo, memberId } = await freshHousehold("c");
    const first = await repo.assistant.createConversation({ startedByMemberId: memberId, title: "first" });
    const second = await repo.assistant.createConversation({ startedByMemberId: memberId, title: "second" });
    // Posting into the older thread should float it to the top of the list.
    await repo.assistant.appendMessage({
      conversationId: first.id,
      memberId,
      role: "user",
      content: "ping",
    });
    const list = await repo.assistant.listConversations();
    expect(list.map((c) => c.id)).toEqual([first.id, second.id]);
  });

  it("scopes reads to the household (no cross-tenant leak)", async () => {
    const a = await freshHousehold("d1");
    const b = await freshHousehold("d2");
    const convA = await a.repo.assistant.createConversation({
      startedByMemberId: a.memberId,
      title: "secret",
    });
    // Household B must not see A's conversation, by id or in its list.
    expect(await b.repo.assistant.getConversation(convA.id)).toBeUndefined();
    expect(await b.repo.assistant.listConversations()).toHaveLength(0);
    expect(await b.repo.assistant.listMessages(convA.id)).toHaveLength(0);
  });

  it("counts a member's messages sent today (for the daily fair-use cap)", async () => {
    const { repo, memberId } = await freshHousehold("e");
    const conv = await repo.assistant.createConversation({ startedByMemberId: memberId, title: "t" });
    expect(await repo.assistant.countMessagesSince(new Date(0))).toBe(0);
    await repo.assistant.appendMessage({
      conversationId: conv.id,
      memberId,
      role: "user",
      content: "one",
    });
    await repo.assistant.appendMessage({
      conversationId: conv.id,
      memberId: null,
      role: "assistant",
      content: "answer",
    });
    // Only user messages count toward the cap; the assistant reply does not.
    expect(await repo.assistant.countMessagesSince(new Date(0))).toBe(1);
  });
});
