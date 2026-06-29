import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { accounts, households, members } from "./schema";

const NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000";

function freshDb() {
  return drizzle(new PGlite(), { schema: { households, members, accounts } });
}

describe("tenant & identity schema", () => {
  let db: ReturnType<typeof freshDb>;

  beforeAll(async () => {
    db = freshDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("defaults a new household to Free, ISK, with no renewal date", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    expect(hh.plan).toBe("Free");
    expect(hh.planRenewsAt).toBeNull();
    expect(hh.billingCurrency).toBe("ISK");
  });

  it("links a member and an account to a household", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    const [member] = await db
      .insert(members)
      .values({ householdId: hh.id, authUserId: `stack_${hh.id}` })
      .returning();
    const [account] = await db
      .insert(accounts)
      .values({ householdId: hh.id, name: "Visa" })
      .returning();
    expect(member.householdId).toBe(hh.id);
    expect(account.householdId).toBe(hh.id);
  });

  it("rejects a member whose household does not exist (FK)", async () => {
    await expect(
      db.insert(members).values({ householdId: NONEXISTENT_ID, authUserId: "orphan" }),
    ).rejects.toThrow();
  });

  it("enforces one member per Stack auth user (unique)", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    await db.insert(members).values({ householdId: hh.id, authUserId: "dupe" });
    await expect(
      db.insert(members).values({ householdId: hh.id, authUserId: "dupe" }),
    ).rejects.toThrow();
  });

  it("rejects a Free household that carries a renewal date", async () => {
    await expect(
      db.insert(households).values({ plan: "Free", planRenewsAt: new Date("2026-07-01") }),
    ).rejects.toThrow();
  });

  it("allows a Premium household with a renewal date", async () => {
    const [hh] = await db
      .insert(households)
      .values({ plan: "Premium", planRenewsAt: new Date("2026-07-01") })
      .returning();
    expect(hh.plan).toBe("Premium");
  });

  it("rejects a non-ISO-4217 billing currency", async () => {
    await expect(
      db.insert(households).values({ billingCurrency: "isk" }),
    ).rejects.toThrow();
  });
});
