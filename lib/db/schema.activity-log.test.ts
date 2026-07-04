import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { activityLog, households } from "./schema";

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

const NONEXISTENT_MEMBER = "00000000-0000-0000-0000-0000000000ff";

// ADR-0017: the log is deliberately decoupled from the financial/identity tables so it survives a
// household data reset and outlives a departed Member.
describe("activity_log schema (ADR-0017)", () => {
  it("accepts a memberId that is not a real member row (member_id is not an FK)", async () => {
    const [h] = await db.insert(households).values({}).returning();
    // A departed Member's row may be gone; the log must still record/keep the actor id.
    await expect(
      db.insert(activityLog).values({
        householdId: h.id,
        memberId: NONEXISTENT_MEMBER,
        actorName: "Departed Partner",
        action: "transaction.excluded",
        payload: { transactionId: "tx-gone", summary: "references a deleted row, no FK" },
      }),
    ).resolves.toBeDefined();
  });

  it("rejects an entry whose household does not exist (household_id IS an FK)", async () => {
    await expect(
      db.insert(activityLog).values({
        householdId: "00000000-0000-0000-0000-000000000000",
        memberId: NONEXISTENT_MEMBER,
        actorName: "Nobody",
        action: "x.y",
      }),
    ).rejects.toThrow();
  });

  it("removes the log only when the Household is deleted (ON DELETE CASCADE)", async () => {
    const [h] = await db.insert(households).values({}).returning();
    await db.insert(activityLog).values({
      householdId: h.id,
      memberId: NONEXISTENT_MEMBER,
      actorName: "Ada",
      action: "data.reset",
    });
    await db.delete(households).where(eq(households.id, h.id));
    const remaining = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.householdId, h.id));
    expect(remaining).toHaveLength(0);
  });
});
