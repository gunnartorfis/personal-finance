import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { households } from "@/lib/db/schema";
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
});
