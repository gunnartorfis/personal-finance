import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households, members } from "@/lib/db/schema";

import { toAiTools } from "./ai-tools";
import { assistantDailyCapReached, startOfUtcDay } from "./rate-limit";
import { buildAssistantSystemPrompt } from "./system-prompt";
import { assistantTools } from "./tools";
import type { AssistantToolContext } from "./tools/types";

const NOW = new Date("2026-03-15T09:30:00Z");

describe("buildAssistantSystemPrompt", () => {
  it("anchors today's date and the current cycle, and grounds answers in tools", () => {
    const prompt = buildAssistantSystemPrompt({ locale: "is", now: NOW });
    expect(prompt).toContain("2026-03-15"); // today
    expect(prompt).toContain("2026-03"); // current cycle key
    expect(prompt.toLowerCase()).toContain("only"); // tool-grounding ("use only the tools")
    expect(prompt).toMatch(/never (invent|fabricate|make up)/i);
    expect(prompt).toMatch(/not a financial advisor/i);
  });

  it("instructs Icelandic vs English by the member's locale", () => {
    expect(buildAssistantSystemPrompt({ locale: "is", now: NOW })).toContain("Icelandic");
    expect(buildAssistantSystemPrompt({ locale: "en", now: NOW })).toContain("English");
  });
});

describe("toAiTools", () => {
  let db: ReturnType<typeof drizzle>;
  let ctx: AssistantToolContext;

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [hh] = await db.insert(households).values({}).returning();
    await db.insert(members).values({ householdId: hh.id, authUserId: "ai-tools" });
    ctx = { repo: householdRepo(db as unknown as Parameters<typeof householdRepo>[0], hh.id), now: NOW };
  });

  it("exposes every assistant tool by name with an executable schema", () => {
    const aiTools = toAiTools(ctx);
    expect(Object.keys(aiTools).sort()).toEqual(assistantTools.map((t) => t.name).sort());
    for (const t of Object.values(aiTools)) {
      expect(typeof t.execute).toBe("function");
      expect(t.inputSchema).toBeDefined();
    }
  });

  it("delegates execute to the underlying tool's run against the bound context", async () => {
    const aiTools = toAiTools(ctx);
    const viaAdapter = await aiTools.getCycleSummary.execute!({ cycle: "2026-03" }, {} as never);
    const viaRun = await assistantTools.find((t) => t.name === "getCycleSummary")!.run(ctx, { cycle: "2026-03" });
    expect(viaAdapter).toEqual(viaRun);
  });
});

describe("assistantDailyCapReached", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("computes UTC start-of-day", () => {
    expect(startOfUtcDay(NOW).toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("trips once the household reaches the cap for the current UTC day", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    const [m] = await db.insert(members).values({ householdId: hh.id, authUserId: "cap" }).returning();
    const repo = householdRepo(asRepoDb(db), hh.id);
    const conv = await repo.assistant.createConversation({ startedByMemberId: m.id, title: "t" });

    expect(await assistantDailyCapReached(repo, NOW, 2)).toBe(false);
    await repo.assistant.appendMessage({ conversationId: conv.id, memberId: m.id, role: "user", content: "1" });
    await repo.assistant.appendMessage({ conversationId: conv.id, memberId: m.id, role: "user", content: "2" });
    expect(await assistantDailyCapReached(repo, NOW, 2)).toBe(true);
  });
});
