import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import {
  households,
  savingsGoals,
  savingsIncomeSources,
  savingsOffcardCosts,
} from "./schema";

const NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000";

function freshDb() {
  return drizzle(new PGlite(), {
    schema: { households, savingsGoals, savingsIncomeSources, savingsOffcardCosts },
  });
}

/** Insert a bare Household and return its id — the tenant every savings row hangs off. */
async function newHousehold(db: ReturnType<typeof freshDb>): Promise<string> {
  const [hh] = await db.insert(households).values({}).returning();
  return hh.id;
}

describe("savings schema (ADR-0007)", () => {
  let db: ReturnType<typeof freshDb>;

  beforeAll(async () => {
    db = freshDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  describe("savings_goals", () => {
    it("defaults startingSaved to 0 and currency to ISK", async () => {
      const householdId = await newHousehold(db);
      const [goal] = await db
        .insert(savingsGoals)
        .values({ householdId, target: 5_000_000, targetDate: "2027-07-01", startCycle: "2026-07" })
        .returning();
      expect(goal.startingSaved).toBe(0);
      expect(goal.currency).toBe("ISK");
    });

    it("allows only one goal per household (unique)", async () => {
      const householdId = await newHousehold(db);
      const base = { householdId, target: 1_000_000, targetDate: "2027-01-01", startCycle: "2026-07" };
      await db.insert(savingsGoals).values(base);
      await expect(db.insert(savingsGoals).values(base)).rejects.toThrow();
    });

    it("rejects a non-positive target", async () => {
      const householdId = await newHousehold(db);
      await expect(
        db
          .insert(savingsGoals)
          .values({ householdId, target: 0, targetDate: "2027-01-01", startCycle: "2026-07" }),
      ).rejects.toThrow();
    });

    it("rejects a malformed start cycle key", async () => {
      const householdId = await newHousehold(db);
      await expect(
        db
          .insert(savingsGoals)
          .values({ householdId, target: 100, targetDate: "2027-01-01", startCycle: "2026-13" }),
      ).rejects.toThrow();
    });

    it("rejects a target date that precedes the start cycle (already expired)", async () => {
      const householdId = await newHousehold(db);
      await expect(
        db
          .insert(savingsGoals)
          .values({ householdId, target: 5_000_000, targetDate: "2020-01-01", startCycle: "2026-07" }),
      ).rejects.toThrow();
    });

    it("rejects a goal for a household that does not exist (FK)", async () => {
      await expect(
        db
          .insert(savingsGoals)
          .values({ householdId: NONEXISTENT_ID, target: 100, targetDate: "2027-01-01", startCycle: "2026-07" }),
      ).rejects.toThrow();
    });
  });

  describe("savings_income_sources & savings_offcard_costs", () => {
    it("stores income sources and off-card costs for a household", async () => {
      const householdId = await newHousehold(db);
      const [income] = await db
        .insert(savingsIncomeSources)
        .values({ householdId, name: "Salary", amount: 600_000 })
        .returning();
      const [cost] = await db
        .insert(savingsOffcardCosts)
        .values({ householdId, name: "Rent", monthlyAmount: 250_000 })
        .returning();
      expect(income.amount).toBe(600_000);
      expect(cost.monthlyAmount).toBe(250_000);
    });

    it("rejects a negative income amount and a negative off-card cost", async () => {
      const householdId = await newHousehold(db);
      await expect(
        db.insert(savingsIncomeSources).values({ householdId, name: "Bad", amount: -1 }),
      ).rejects.toThrow();
      await expect(
        db.insert(savingsOffcardCosts).values({ householdId, name: "Bad", monthlyAmount: -1 }),
      ).rejects.toThrow();
    });
  });
});
