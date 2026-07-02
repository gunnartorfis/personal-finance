import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { loadExpectedSpend } from "./expected-spend";

let db: ReturnType<typeof drizzle>;
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function freshHousehold() {
  const [h] = await db.insert(households).values({}).returning();
  return householdRepo(asRepoDb(db), h.id);
}

/** Seed one classified expense (negative amount) on `date`. */
async function seedExpense(
  repo: Awaited<ReturnType<typeof freshHousehold>>,
  base: { accountId: string; uploadId: string },
  date: string,
  amount: number,
  expenseType: "Fixed" | "Necessary" | "Nice to have",
  sourceRow: number,
) {
  const [txn] = await repo.transactions.create({
    ...base,
    date,
    amount,
    merchant: "M",
    rawCategory: "",
    sourceRow,
  });
  await repo.transactions.classify(txn.id, { expenseType });
}

describe("loadExpectedSpend", () => {
  const NOW = new Date("2026-07-15T12:00:00Z");

  it("averages Fixed/Necessary over the previous three completed cycles, excluding the current one", async () => {
    const repo = await freshHousehold();
    const [account] = await repo.accounts.create({ name: "Visa" });
    const [upload] = await repo.uploads.create({
      accountId: account.id,
      fileName: "f.csv",
      fileHash: "es-1",
    });
    const base = { accountId: account.id, uploadId: upload.id };

    // May and June carry history; April has none (skipped by the estimator).
    await seedExpense(repo, base, "2026-05-10", -40_000, "Fixed", 0);
    await seedExpense(repo, base, "2026-05-12", -180_000, "Necessary", 1);
    await seedExpense(repo, base, "2026-06-10", -44_000, "Fixed", 2);
    await seedExpense(repo, base, "2026-06-12", -190_000, "Necessary", 3);
    // Nice-to-have never feeds the estimate.
    await seedExpense(repo, base, "2026-06-20", -99_000, "Nice to have", 4);
    // Current (incomplete) cycle must not feed the estimate.
    await seedExpense(repo, base, "2026-07-05", -500_000, "Fixed", 5);
    // Too old (outside the trailing window of 3 completed cycles).
    await seedExpense(repo, base, "2026-03-05", -900_000, "Fixed", 6);

    expect(await loadExpectedSpend(repo, NOW)).toEqual({
      expectedFixed: 42_000,
      expectedNecessary: 185_000,
      cyclesUsed: 2,
      source: "history",
    });
  });

  it("falls back to the given manual values when there is no trailing history", async () => {
    const repo = await freshHousehold();
    expect(
      await loadExpectedSpend(repo, NOW, {
        expectedFixed: 50_000,
        expectedNecessary: 150_000,
      }),
    ).toEqual({
      expectedFixed: 50_000,
      expectedNecessary: 150_000,
      cyclesUsed: 0,
      source: "manual",
    });
  });
});
