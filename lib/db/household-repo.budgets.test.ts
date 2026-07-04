import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

describe("category budgets repo", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  async function twoHouseholds() {
    const [a] = await db.insert(households).values({}).returning();
    const [b] = await db.insert(households).values({}).returning();
    return { a: householdRepo(asRepoDb(db), a.id), b: householdRepo(asRepoDb(db), b.id) };
  }

  it("replaces the full set and lists budgets in a stable order", async () => {
    const { a } = await twoHouseholds();
    await a.budgets.replace([
      { expenseType: "Necessary", monthlyAmount: 80_000 },
      { expenseType: "Fixed", monthlyAmount: 200_000 },
    ]);
    expect((await a.budgets.list()).map((b) => [b.expenseType, b.monthlyAmount])).toEqual([
      ["Fixed", 200_000],
      ["Necessary", 80_000],
    ]);

    // A second replace is a full swap, not an append.
    await a.budgets.replace([{ expenseType: "Nice to have", monthlyAmount: 30_000 }]);
    expect((await a.budgets.list()).map((b) => b.expenseType)).toEqual(["Nice to have"]);
  });

  it("clears all budgets when replaced with an empty list", async () => {
    const { a } = await twoHouseholds();
    await a.budgets.replace([{ expenseType: "Fixed", monthlyAmount: 100_000 }]);
    await a.budgets.replace([]);
    expect(await a.budgets.list()).toEqual([]);
  });

  it("scopes budgets to the household", async () => {
    const { a, b } = await twoHouseholds();
    await a.budgets.replace([{ expenseType: "Fixed", monthlyAmount: 100_000 }]);
    expect(await b.budgets.list()).toEqual([]);
  });

  it("rejects an invalid expense type via the DB check", async () => {
    const { a } = await twoHouseholds();
    await expect(
      a.budgets.replace([{ expenseType: "Splurge", monthlyAmount: 10_000 }]),
    ).rejects.toThrow();
  });

  it("rejects a non-positive budget via the DB check", async () => {
    const { a } = await twoHouseholds();
    await expect(
      a.budgets.replace([{ expenseType: "Fixed", monthlyAmount: 0 }]),
    ).rejects.toThrow();
  });
});
