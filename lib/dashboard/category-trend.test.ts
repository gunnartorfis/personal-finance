import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";
import type { ExpenseType } from "@/shared/types";

import {
  buildCategoryTrend,
  loadCategoryTrend,
  type CategoryTrendPoint,
} from "./category-trend";

/** Build an expected point, filling unmentioned buckets with zero. */
function point(
  month: string,
  byType: Partial<Record<ExpenseType, number>>,
  unclassified = 0,
): CategoryTrendPoint {
  return {
    month,
    byExpenseType: { Fixed: 0, Necessary: 0, "Nice to have": 0, "": 0, ...byType },
    unclassified,
  };
}

describe("buildCategoryTrend", () => {
  it("is empty when there are no month keys", () => {
    expect(buildCategoryTrend([{ month: "2026-01", effectiveType: "Fixed", spending: 1 }], [])).toEqual(
      [],
    );
  });

  it("buckets debit magnitude by effective type per month, gap-fills, and folds unknowns into unclassified", () => {
    const trend = buildCategoryTrend(
      [
        { month: "2026-01", effectiveType: "Fixed", spending: 300 },
        { month: "2026-01", effectiveType: null, spending: 100 }, // pending -> unclassified
        { month: "2026-03", effectiveType: "Nice to have", spending: 50 },
        { month: "2026-03", effectiveType: "", spending: 40 }, // not-bucketed still counts
        { month: "2025-12", effectiveType: "Fixed", spending: 999 }, // outside window -> ignored
      ],
      ["2026-01", "2026-02", "2026-03"],
    );
    expect(trend).toEqual([
      point("2026-01", { Fixed: 300 }, 100),
      point("2026-02", {}),
      point("2026-03", { "Nice to have": 50, "": 40 }),
    ]);
  });
});

describe("loadCategoryTrend", () => {
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

  const NOW = new Date("2026-03-15T12:00:00Z");

  it("resolves the effective type (override wins), ignores credits and out-of-range rows", async () => {
    const repo = await freshHousehold();
    const [account] = await repo.accounts.create({ name: "Visa" });
    const [upload] = await repo.uploads.create({
      accountId: account.id,
      fileName: "c.csv",
      fileHash: "c",
    });
    const base = { accountId: account.id, uploadId: upload.id, rawCategory: "" };
    const [rent, pending, buy, split] = await repo.transactions.createMany([
      { ...base, date: "2026-01-05", amount: -300, merchant: "RENT", sourceRow: 0 },
      { ...base, date: "2026-01-10", amount: -100, merchant: "X", sourceRow: 1 }, // stays pending
      { ...base, date: "2026-02-12", amount: -200, merchant: "BUY", sourceRow: 2 },
      { ...base, date: "2026-03-02", amount: -40, merchant: "SPLIT", sourceRow: 3 },
      { ...base, date: "2026-03-03", amount: 500, merchant: "SALARY", sourceRow: 4 }, // credit
      { ...base, date: "2025-12-31", amount: -999, merchant: "OLD", sourceRow: 5 }, // out of range
    ]);
    await repo.transactions.classify(rent.id, { expenseType: "Fixed" });
    await repo.transactions.classify(buy.id, { expenseType: "Necessary" });
    await repo.transactions.classify(split.id, { expenseType: "" });
    // Override wins over the classified "Necessary".
    await repo.overrides.create({ transactionId: buy.id, expenseType: "Nice to have" });
    void pending; // left pending -> unclassified

    const trend = await loadCategoryTrend(repo, NOW, 3);
    expect(trend).toEqual([
      point("2026-01", { Fixed: 300 }, 100),
      point("2026-02", { "Nice to have": 200 }),
      point("2026-03", { "": 40 }),
    ]);
  });

  it("never counts another household's transactions", async () => {
    const a = await freshHousehold();
    const b = await freshHousehold();
    const [accB] = await b.accounts.create({ name: "B-Visa" });
    const [upB] = await b.uploads.create({ accountId: accB.id, fileName: "b2.csv", fileHash: "b2" });
    const [tx] = await b.transactions.create({
      accountId: accB.id,
      uploadId: upB.id,
      date: "2026-02-12",
      amount: -200,
      merchant: "B-ONLY",
      rawCategory: "",
      sourceRow: 0,
    });
    await b.transactions.classify(tx.id, { expenseType: "Fixed" });

    expect(await loadCategoryTrend(a, NOW, 3)).toEqual([
      point("2026-01", {}),
      point("2026-02", {}),
      point("2026-03", {}),
    ]);
  });
});
