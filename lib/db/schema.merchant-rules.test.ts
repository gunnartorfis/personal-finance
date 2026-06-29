import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { households, merchantRules } from "./schema";

function freshDb() {
  return drizzle(new PGlite(), { schema: { households, merchantRules } });
}

describe("merchant rules schema", () => {
  let db: ReturnType<typeof freshDb>;
  let householdId: string;

  beforeAll(async () => {
    db = freshDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [hh] = await db.insert(households).values({}).returning();
    householdId = hh.id;
  });

  it("accepts a flat rule", async () => {
    const [r] = await db
      .insert(merchantRules)
      .values({ householdId, merchant: "NETFLIX", flatType: "Fixed" })
      .returning();
    expect(r.flatType).toBe("Fixed");
  });

  it("accepts a flat rule with the empty (not-bucketed) type", async () => {
    const [r] = await db
      .insert(merchantRules)
      .values({ householdId, merchant: "AUR", flatType: "" })
      .returning();
    expect(r.flatType).toBe("");
  });

  it("accepts an amount-threshold split rule", async () => {
    const [r] = await db
      .insert(merchantRules)
      .values({
        householdId,
        merchant: "WORLD CLASS",
        threshold: 8000,
        atOrAboveType: "Fixed",
        belowType: "Nice to have",
      })
      .returning();
    expect(r.threshold).toBe(8000);
  });

  it("rejects a rule that is both flat and split", async () => {
    await expect(
      db.insert(merchantRules).values({
        householdId,
        merchant: "BOTH",
        flatType: "Fixed",
        threshold: 8000,
        atOrAboveType: "Fixed",
        belowType: "Nice to have",
      }),
    ).rejects.toThrow();
  });

  it("rejects a rule that is neither flat nor split", async () => {
    await expect(
      db.insert(merchantRules).values({ householdId, merchant: "EMPTY" }),
    ).rejects.toThrow();
  });

  it("rejects a split rule missing a branch", async () => {
    await expect(
      db
        .insert(merchantRules)
        .values({ householdId, merchant: "PARTIAL", threshold: 8000, atOrAboveType: "Fixed" }),
    ).rejects.toThrow();
  });

  it("rejects an invalid expense type", async () => {
    await expect(
      db.insert(merchantRules).values({ householdId, merchant: "BAD", flatType: "Luxury" }),
    ).rejects.toThrow();
  });

  it("enforces one rule per merchant per household", async () => {
    await db.insert(merchantRules).values({ householdId, merchant: "BONUS", flatType: "Necessary" });
    await expect(
      db.insert(merchantRules).values({ householdId, merchant: "BONUS", flatType: "Fixed" }),
    ).rejects.toThrow();
  });

  it("rejects a non-positive split threshold", async () => {
    for (const threshold of [0, -100]) {
      await expect(
        db
          .insert(merchantRules)
          .values({
            householdId,
            merchant: `T${threshold}`,
            threshold,
            atOrAboveType: "Fixed",
            belowType: "Nice to have",
          }),
      ).rejects.toThrow();
    }
  });
});
