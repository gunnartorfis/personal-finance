import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households, members } from "@/lib/db/schema";

import {
  AssistantDailyCapError,
  AssistantNotPremiumError,
  deriveTitle,
  persistAssistantReply,
  prepareAssistantTurn,
} from "./turn";

const NOW = new Date("2026-03-15T09:00:00Z");

let db: ReturnType<typeof drizzle>;
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

async function seed(authUserId: string, plan: "Free" | "Premium") {
  const [hh] = await db.insert(households).values({}).returning();
  if (plan === "Premium") await db.update(households).set({ plan: "Premium" }).where(eq(households.id, hh.id));
  const [m] = await db.insert(members).values({ householdId: hh.id, authUserId }).returning();
  return { repo: householdRepo(asRepoDb(db), hh.id), memberId: m.id };
}

const base = (over: Partial<Parameters<typeof prepareAssistantTurn>[1]> = {}) => ({
  plan: "Premium" as const,
  locale: "is" as const,
  memberId: "",
  now: NOW,
  message: "Why was March higher?",
  ...over,
});

describe("prepareAssistantTurn", () => {
  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("rejects a non-Premium household", async () => {
    const { repo, memberId } = await seed("free", "Free");
    await expect(prepareAssistantTurn(repo, base({ memberId, plan: "Free" }))).rejects.toBeInstanceOf(
      AssistantNotPremiumError,
    );
  });

  it("rejects once the daily cap is reached", async () => {
    const { repo, memberId } = await seed("capped", "Premium");
    const conv = await repo.assistant.createConversation({ startedByMemberId: memberId, title: "t" });
    await repo.assistant.appendMessage({ conversationId: conv.id, memberId, role: "user", content: "x" });
    await expect(prepareAssistantTurn(repo, base({ memberId, cap: 1 }))).rejects.toBeInstanceOf(AssistantDailyCapError);
  });

  it("creates a conversation titled from the first question and persists the user message", async () => {
    const { repo, memberId } = await seed("new", "Premium");
    const turn = await prepareAssistantTurn(repo, base({ memberId }));
    const [conv] = await repo.assistant.listConversations();
    expect(conv.id).toBe(turn.conversationId);
    expect(conv.title).toBe("Why was March higher?");
    expect(conv.startedByMemberId).toBe(memberId);
    expect(turn.modelMessages).toEqual([{ role: "user", content: "Why was March higher?" }]);
    expect(turn.system).toContain("2026-03");
    expect(Object.keys(turn.tools).length).toBeGreaterThanOrEqual(8);
  });

  it("continues an existing conversation, loading the full thread", async () => {
    const { repo, memberId } = await seed("cont", "Premium");
    const conv = await repo.assistant.createConversation({ startedByMemberId: memberId, title: "t" });
    await repo.assistant.appendMessage({ conversationId: conv.id, memberId, role: "user", content: "first" });
    await repo.assistant.appendMessage({ conversationId: conv.id, memberId: null, role: "assistant", content: "answer" });

    const turn = await prepareAssistantTurn(repo, base({ memberId, conversationId: conv.id, message: "follow up" }));
    expect(turn.conversationId).toBe(conv.id);
    expect(turn.modelMessages).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "follow up" },
    ]);
  });

  it("rejects an unknown conversation id", async () => {
    const { repo, memberId } = await seed("bad", "Premium");
    await expect(
      prepareAssistantTurn(repo, base({ memberId, conversationId: "00000000-0000-0000-0000-0000000000ff" })),
    ).rejects.toThrow(/conversation_not_found/);
  });

  it("rejects a malformed conversation id without hitting the database", async () => {
    const { repo, memberId } = await seed("malformed", "Premium");
    await expect(
      prepareAssistantTurn(repo, base({ memberId, conversationId: "not-a-uuid" })),
    ).rejects.toThrow(/conversation_not_found/);
  });

  it("rejects an empty or oversized message", async () => {
    const { repo, memberId } = await seed("bounds", "Premium");
    await expect(prepareAssistantTurn(repo, base({ memberId, message: "   " }))).rejects.toThrow(/empty_message/);
    await expect(prepareAssistantTurn(repo, base({ memberId, message: "a".repeat(5000) }))).rejects.toThrow(/message_too_long/);
  });
});

describe("deriveTitle", () => {
  it("collapses whitespace and truncates long questions with an ellipsis", () => {
    expect(deriveTitle("  why   was   March  higher? ")).toBe("why was March higher?");
    const long = deriveTitle("a ".repeat(100));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("persistAssistantReply", () => {
  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("appends the assistant answer unattributed; ignores empty text", async () => {
    const { repo, memberId } = await seed("reply", "Premium");
    const conv = await repo.assistant.createConversation({ startedByMemberId: memberId, title: "t" });
    await persistAssistantReply(repo, conv.id, "   ");
    expect(await repo.assistant.listMessages(conv.id)).toHaveLength(0);
    await persistAssistantReply(repo, conv.id, "the answer");
    const msgs = await repo.assistant.listMessages(conv.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ role: "assistant", memberId: null, content: "the answer" });
  });
});
