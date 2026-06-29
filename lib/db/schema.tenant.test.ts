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

  it("defaults a new household to the Free plan with no renewal date", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    expect(hh.plan).toBe("Free");
    expect(hh.planRenewsAt).toBeNull();
  });

  it("links a member and an account to a household", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    const [member] = await db
      .insert(members)
      .values({ householdId: hh.id, authUserId: `stack_${hh.id}` })
      .returning();
    const [account] = await db
      .insert(accounts)
      .values({ householdId: hh.id, name: "Visa", billingCurrency: "ISK" })
      .returning();
    expect(member.householdId).toBe(hh.id);
    expect(account.billingCurrency).toBe("ISK");
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
});
