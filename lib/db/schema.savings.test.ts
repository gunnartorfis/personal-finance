import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import {
  households,
  savingsGoals,
  savingsIncomeSources,
  savingsOffcardCosts,
  savingsOneOffAdjustments,
} from "./schema";

const NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000";

function freshDb() {
  return drizzle(new PGlite(), {
    schema: {
      households,
      savingsGoals,
      savingsIncomeSources,
      savingsOffcardCosts,
      savingsOneOffAdjustments,
    },
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

    it("stores an explicit effective cycle on income and off-card rows (ADR-0015)", async () => {
      const householdId = await newHousehold(db);
      const [income] = await db
        .insert(savingsIncomeSources)
        .values({ householdId, name: "Salary", amount: 600_000, effectiveFrom: "2026-07" })
        .returning();
      const [cost] = await db
        .insert(savingsOffcardCosts)
        .values({ householdId, name: "Rent", monthlyAmount: 320_000, effectiveFrom: "2026-07" })
        .returning();
      expect(income.effectiveFrom).toBe("2026-07");
      expect(cost.effectiveFrom).toBe("2026-07");
    });

    it("defaults effectiveFrom to the floor sentinel when unspecified (pre-ADR-0015 baseline)", async () => {
      const householdId = await newHousehold(db);
      const [income] = await db
        .insert(savingsIncomeSources)
        .values({ householdId, name: "Salary", amount: 600_000 })
        .returning();
      // Floor is <= every real cycle key, so an un-dated baseline is in force from the start.
      expect(income.effectiveFrom).toBe("0001-01");
    });

    it("rejects a malformed effective cycle on an income row", async () => {
      const householdId = await newHousehold(db);
      await expect(
        db
          .insert(savingsIncomeSources)
          .values({ householdId, name: "Bad", amount: 1, effectiveFrom: "2026-13" }),
      ).rejects.toThrow();
    });

    it("backfill moves floor-defaulted rows to their goal's start cycle, leaving goal-less rows at the floor", async () => {
      // Mirrors the ADR-0015 data migration: pre-existing (floor-defaulted) rows adopt their
      // Household's goal start cycle; a Household with no goal keeps the '0001-01' floor. The
      // fresh-migrate harness has no pre-existing rows, so we build the floor state and re-run the
      // exact shipped statement (idempotent) to guard its join/scoping.
      const withGoal = await newHousehold(db);
      await db.insert(savingsGoals).values({
        householdId: withGoal,
        target: 1_000_000,
        targetDate: "2027-01-01",
        startCycle: "2026-07",
      });
      await db.insert(savingsIncomeSources).values({ householdId: withGoal, name: "Salary", amount: 500_000 });
      const noGoal = await newHousehold(db);
      await db.insert(savingsIncomeSources).values({ householdId: noGoal, name: "Salary", amount: 400_000 });

      await db.execute(
        sql`UPDATE "savings_income_sources" AS s SET "effective_from" = g."start_cycle" FROM "savings_goals" g WHERE g."household_id" = s."household_id"`,
      );

      const rows = await db.select().from(savingsIncomeSources);
      expect(rows.find((r) => r.householdId === withGoal)!.effectiveFrom).toBe("2026-07");
      expect(rows.find((r) => r.householdId === noGoal)!.effectiveFrom).toBe("0001-01");
    });
  });

  describe("savings_one_off_adjustments (ADR-0015)", () => {
    it("stores a one-off income addition and a one-off cost on a cycle", async () => {
      const householdId = await newHousehold(db);
      const [bonus] = await db
        .insert(savingsOneOffAdjustments)
        .values({ householdId, cycleKey: "2026-03", kind: "income", amount: 300_000, label: "Tax refund" })
        .returning();
      const [bill] = await db
        .insert(savingsOneOffAdjustments)
        .values({ householdId, cycleKey: "2026-04", kind: "cost", amount: 90_000 })
        .returning();
      expect(bonus.kind).toBe("income");
      expect(bonus.amount).toBe(300_000);
      expect(bonus.label).toBe("Tax refund");
      expect(bill.kind).toBe("cost");
      expect(bill.label).toBeNull();
    });

    it("rejects a negative one-off amount", async () => {
      const householdId = await newHousehold(db);
      await expect(
        db
          .insert(savingsOneOffAdjustments)
          .values({ householdId, cycleKey: "2026-03", kind: "income", amount: -1 }),
      ).rejects.toThrow();
    });

    it("rejects a malformed cycle key", async () => {
      const householdId = await newHousehold(db);
      await expect(
        db
          .insert(savingsOneOffAdjustments)
          .values({ householdId, cycleKey: "2026-13", kind: "income", amount: 1 }),
      ).rejects.toThrow();
    });

    it("rejects an unknown kind (enum)", async () => {
      const householdId = await newHousehold(db);
      await expect(
        db
          .insert(savingsOneOffAdjustments)
          // @ts-expect-error — kind is constrained to the one_off_kind enum
          .values({ householdId, cycleKey: "2026-03", kind: "bogus", amount: 1 }),
      ).rejects.toThrow();
    });

    it("rejects a one-off for a household that does not exist (FK)", async () => {
      await expect(
        db
          .insert(savingsOneOffAdjustments)
          .values({ householdId: NONEXISTENT_ID, cycleKey: "2026-03", kind: "income", amount: 1 }),
      ).rejects.toThrow();
    });
  });
});
