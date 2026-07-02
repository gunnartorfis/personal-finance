import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "./household-repo";
import { households } from "./schema";

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

// pglite's drizzle db exposes the same query surface; cast to the repo's expected db type.
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

/** Create two fresh households and a repo scoped to each. */
async function twoHouseholds() {
  const [a] = await db.insert(households).values({}).returning();
  const [b] = await db.insert(households).values({}).returning();
  return {
    a: householdRepo(asRepoDb(db), a.id),
    b: householdRepo(asRepoDb(db), b.id),
    aId: a.id,
  };
}

const goalValue = {
  target: 3_000_000,
  targetDate: "2027-06-01",
  startingSaved: 250_000,
  startCycle: "2026-07",
} as const;

describe("householdRepo savings", () => {
  it("returns undefined when the household has no savings goal", async () => {
    const { a } = await twoHouseholds();
    expect(await a.savings.goal.get()).toBeUndefined();
  });

  it("upserting a goal stamps the bound householdId", async () => {
    const { a, aId } = await twoHouseholds();
    const [goal] = await a.savings.goal.upsert(goalValue);
    expect(goal.householdId).toBe(aId);
    expect(goal.target).toBe(goalValue.target);
  });

  it("upserting a second time updates the single goal instead of duplicating", async () => {
    const { a } = await twoHouseholds();
    const [first] = await a.savings.goal.upsert(goalValue);
    const [second] = await a.savings.goal.upsert({ ...goalValue, target: 4_000_000 });
    expect(second.id).toBe(first.id);
    expect((await a.savings.goal.get())?.target).toBe(4_000_000);
  });

  it("scopes the goal to the bound household", async () => {
    const { a, b } = await twoHouseholds();
    await a.savings.goal.upsert(goalValue);
    expect(await b.savings.goal.get()).toBeUndefined();
  });

  it("replace sets the household's income sources, stamped with the bound householdId", async () => {
    const { a, aId } = await twoHouseholds();
    await a.savings.incomeSources.replace([
      { name: "Salary A", amount: 700_000 },
      { name: "Salary B", amount: 550_000 },
    ]);
    const sources = await a.savings.incomeSources.list();
    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.householdId)).toEqual([aId, aId]);
    expect(sources.map((s) => s.name)).toEqual(["Salary A", "Salary B"]);
  });

  it("replace discards the household's previous income sources, leaving other households' intact", async () => {
    const { a, b } = await twoHouseholds();
    await a.savings.incomeSources.replace([{ name: "Old salary", amount: 500_000 }]);
    await b.savings.incomeSources.replace([{ name: "B salary", amount: 400_000 }]);
    await a.savings.incomeSources.replace([{ name: "New salary", amount: 800_000 }]);
    expect((await a.savings.incomeSources.list()).map((s) => s.name)).toEqual(["New salary"]);
    expect((await b.savings.incomeSources.list()).map((s) => s.name)).toEqual(["B salary"]);
  });

  it("replace with an empty list clears the household's income sources", async () => {
    const { a } = await twoHouseholds();
    await a.savings.incomeSources.replace([{ name: "Salary", amount: 500_000 }]);
    await a.savings.incomeSources.replace([]);
    expect(await a.savings.incomeSources.list()).toHaveLength(0);
  });

  it("replace sets the household's off-card costs, discarding the previous set, scoped", async () => {
    const { a, b, aId } = await twoHouseholds();
    await a.savings.offcardCosts.replace([{ name: "Old rent", monthlyAmount: 200_000 }]);
    await b.savings.offcardCosts.replace([{ name: "B rent", monthlyAmount: 180_000 }]);
    const replaced = await a.savings.offcardCosts.replace([
      { name: "Mortgage", monthlyAmount: 250_000 },
      { name: "Car loan", monthlyAmount: 60_000 },
    ]);
    expect(replaced.map((c) => c.householdId)).toEqual([aId, aId]);
    const costs = await a.savings.offcardCosts.list();
    expect(costs.map((c) => c.name)).toEqual(["Car loan", "Mortgage"]);
    expect((await b.savings.offcardCosts.list()).map((c) => c.name)).toEqual(["B rent"]);
  });

  it("replaceConfig swaps both lists atomically", async () => {
    const { a } = await twoHouseholds();
    const { incomeSources, offcardCosts } = await a.savings.replaceConfig(
      [{ name: "Salary", amount: 700_000 }],
      [{ name: "Mortgage", monthlyAmount: 250_000 }],
    );
    expect(incomeSources.map((s) => s.name)).toEqual(["Salary"]);
    expect(offcardCosts.map((c) => c.name)).toEqual(["Mortgage"]);
  });

  it("replaceConfig rolls back the income replace when the off-card write fails", async () => {
    const { a } = await twoHouseholds();
    await a.savings.replaceConfig(
      [{ name: "Old salary", amount: 500_000 }],
      [{ name: "Old rent", monthlyAmount: 200_000 }],
    );
    // Negative monthlyAmount violates the CHECK constraint mid-transaction.
    await expect(
      a.savings.replaceConfig(
        [{ name: "New salary", amount: 800_000 }],
        [{ name: "Bad", monthlyAmount: -1 }],
      ),
    ).rejects.toThrow();
    expect((await a.savings.incomeSources.list()).map((s) => s.name)).toEqual(["Old salary"]);
    expect((await a.savings.offcardCosts.list()).map((c) => c.name)).toEqual(["Old rent"]);
  });

  it("upserting a check-in freezes the cycle snapshot, stamped with the bound householdId", async () => {
    const { a, aId } = await twoHouseholds();
    const [checkin] = await a.savings.checkins.upsertByCycle({
      cycleKey: "2026-07",
      monthlyIncome: 1_250_000,
      cycleExtra: 0,
      offCardFixed: 310_000,
      cardDebits: 640_000,
      inferredSaving: 300_000,
    });
    expect(checkin.householdId).toBe(aId);
    expect(checkin.cycleKey).toBe("2026-07");
    expect(checkin.inferredSaving).toBe(300_000);
  });

  it("re-checking the same cycle updates the frozen snapshot instead of duplicating", async () => {
    const { a } = await twoHouseholds();
    const snapshot = {
      cycleKey: "2026-07",
      monthlyIncome: 1_250_000,
      cycleExtra: 0,
      offCardFixed: 310_000,
      cardDebits: 640_000,
      inferredSaving: 300_000,
    };
    const [first] = await a.savings.checkins.upsertByCycle(snapshot);
    const [second] = await a.savings.checkins.upsertByCycle({
      ...snapshot,
      cardDebits: 700_000,
      inferredSaving: 240_000,
    });
    expect(second.id).toBe(first.id);
    expect(second.inferredSaving).toBe(240_000);
    expect(await a.savings.checkins.list()).toHaveLength(1);
  });

  it("lists check-ins oldest cycle first, scoped to the bound household", async () => {
    const { a, b } = await twoHouseholds();
    const base = {
      monthlyIncome: 1_000_000,
      cycleExtra: 0,
      offCardFixed: 300_000,
      cardDebits: 500_000,
      inferredSaving: 200_000,
    };
    await a.savings.checkins.upsertByCycle({ ...base, cycleKey: "2026-09" });
    await a.savings.checkins.upsertByCycle({ ...base, cycleKey: "2026-07" });
    await a.savings.checkins.upsertByCycle({ ...base, cycleKey: "2026-08" });
    expect((await a.savings.checkins.list()).map((c) => c.cycleKey)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(await b.savings.checkins.list()).toHaveLength(0);
  });
});
