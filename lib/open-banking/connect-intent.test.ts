import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { bankConnectionIntents, households } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

import { consumeConnectIntent, recordConnectIntent } from "./connect-intent";

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof recordConnectIntent>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function freshHouseholdId() {
  const [h] = await db.insert(households).values({}).returning();
  return h.id;
}

describe("connect intent", () => {
  it("records an intent and resolves the household + institution by state", async () => {
    const householdId = await freshHouseholdId();
    await recordConnectIntent(asDb(db), { state: "state-a", householdId, institutionName: "Arion" });

    const intent = await consumeConnectIntent(asDb(db), "state-a");
    expect(intent).toEqual({ householdId, institutionName: "Arion" });
  });

  it("is single-use — a replayed callback finds nothing", async () => {
    const householdId = await freshHouseholdId();
    await recordConnectIntent(asDb(db), { state: "state-b", householdId });

    expect(await consumeConnectIntent(asDb(db), "state-b")).not.toBeNull();
    // Second consume (replay) resolves to null.
    expect(await consumeConnectIntent(asDb(db), "state-b")).toBeNull();
  });

  it("returns null for an unknown state", async () => {
    expect(await consumeConnectIntent(asDb(db), "never-seen")).toBeNull();
  });

  it("does not resolve an expired intent, and deletes it", async () => {
    const householdId = await freshHouseholdId();
    // Seed a row created 20 minutes ago — past the 15-minute TTL.
    await db.insert(bankConnectionIntents).values({
      state: "state-old",
      householdId,
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
    });

    expect(await consumeConnectIntent(asDb(db), "state-old")).toBeNull();
    // It's gone (deleted regardless), so a later lookup is still null.
    const [remaining] = await db
      .select()
      .from(bankConnectionIntents)
      .where(eq(bankConnectionIntents.state, "state-old"));
    expect(remaining).toBeUndefined();
  });

  it("sweeps expired intents when a new one is recorded", async () => {
    const householdId = await freshHouseholdId();
    await db.insert(bankConnectionIntents).values({
      state: "stale-1",
      householdId,
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    await recordConnectIntent(asDb(db), { state: "fresh-1", householdId });

    const rows = await db.select().from(bankConnectionIntents);
    const states = rows.map((r) => r.state);
    expect(states).toContain("fresh-1");
    expect(states).not.toContain("stale-1");
  });
});
