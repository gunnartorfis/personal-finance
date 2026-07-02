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
});
