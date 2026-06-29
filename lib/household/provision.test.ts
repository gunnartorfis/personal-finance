import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { households, members } from "@/lib/db/schema";

import { ensureHouseholdForUser } from "./provision";

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof ensureHouseholdForUser>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("ensureHouseholdForUser", () => {
  it("creates a household and member on first sign-in", async () => {
    const { householdId, memberId } = await ensureHouseholdForUser(asDb(db), "stack_user_1");
    expect(householdId).toMatch(/^[0-9a-f-]{36}$/);
    const [member] = await db.select().from(members).where(eq(members.id, memberId));
    expect(member.authUserId).toBe("stack_user_1");
    expect(member.householdId).toBe(householdId);
  });

  it("is idempotent — the same user always maps to the same household", async () => {
    const first = await ensureHouseholdForUser(asDb(db), "stack_user_2");
    const second = await ensureHouseholdForUser(asDb(db), "stack_user_2");
    expect(second).toEqual(first);
    // exactly one household and one member exist for this user
    const all = await db.select().from(members).where(eq(members.authUserId, "stack_user_2"));
    expect(all).toHaveLength(1);
  });

  it("gives different users different households", async () => {
    const a = await ensureHouseholdForUser(asDb(db), "stack_user_3");
    const b = await ensureHouseholdForUser(asDb(db), "stack_user_4");
    expect(a.householdId).not.toBe(b.householdId);
    expect(await db.select().from(households)).not.toHaveLength(0);
  });

  it("handles concurrent first sign-ins without creating duplicate households", async () => {
    const [a, b] = await Promise.all([
      ensureHouseholdForUser(asDb(db), "race_user"),
      ensureHouseholdForUser(asDb(db), "race_user"),
    ]);
    expect(a.householdId).toBe(b.householdId);
    const all = await db.select().from(members).where(eq(members.authUserId, "race_user"));
    expect(all).toHaveLength(1);
  });
});
