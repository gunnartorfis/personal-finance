import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { buildMonthlySpendSeries, loadMonthlySpendSeries } from "./monthly-series";

describe("buildMonthlySpendSeries", () => {
  it("is empty when there are no month keys", () => {
    expect(buildMonthlySpendSeries([{ month: "2026-03", spending: 1, income: 2 }], [])).toEqual([]);
  });

  it("fills missing months with zeros, keeps key order, and derives difference", () => {
    const series = buildMonthlySpendSeries(
      [
        { month: "2026-01", spending: 300, income: 100 },
        { month: "2026-03", spending: 0, income: 50 },
      ],
      ["2026-01", "2026-02", "2026-03"],
    );
    expect(series).toEqual([
      { month: "2026-01", spending: 300, income: 100, difference: -200 },
      { month: "2026-02", spending: 0, income: 0, difference: 0 },
      { month: "2026-03", spending: 0, income: 50, difference: 50 },
    ]);
  });

  it("ignores rows for months outside the requested window", () => {
    const series = buildMonthlySpendSeries(
      [
        { month: "2025-12", spending: 999, income: 999 },
        { month: "2026-02", spending: 200, income: 0 },
      ],
      ["2026-01", "2026-02"],
    );
    expect(series).toEqual([
      { month: "2026-01", spending: 0, income: 0, difference: 0 },
      { month: "2026-02", spending: 200, income: 0, difference: -200 },
    ]);
  });
});

describe("loadMonthlySpendSeries", () => {
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

  it("splits debits (spending) from marked-income credits per calendar month over the window", async () => {
    const repo = await freshHousehold();
    const [account] = await repo.accounts.create({ name: "Visa" });
    const [upload] = await repo.uploads.create({
      accountId: account.id,
      fileName: "s.csv",
      fileHash: "s",
    });
    const base = { accountId: account.id, uploadId: upload.id, rawCategory: "" };
    const [, , salary] = await repo.transactions.createMany([
      // January: two debits (spending 300) + one marked credit (income 100)
      { ...base, date: "2026-01-05", amount: -200, merchant: "RENT", sourceRow: 0 },
      { ...base, date: "2026-01-20", amount: -100, merchant: "FOOD", sourceRow: 1 },
      { ...base, date: "2026-01-25", amount: 100, merchant: "SALARY", sourceRow: 2 },
      // February: nothing (must fill with zeros).
      // March: one debit (spending 50) + one UNMARKED credit (a transfer — counts for nothing).
      { ...base, date: "2026-03-02", amount: -50, merchant: "BUS", sourceRow: 3 },
      { ...base, date: "2026-03-08", amount: 100_000, merchant: "TRANSFER", sourceRow: 5 },
      // Out of the 3-month window (older) — excluded.
      { ...base, date: "2025-12-31", amount: -777, merchant: "OLD", sourceRow: 4 },
    ]);
    await repo.transactions.setIncomeMarked(salary.id, true);

    const series = await loadMonthlySpendSeries(repo, NOW, 3);
    expect(series).toEqual([
      { month: "2026-01", spending: 300, income: 100, difference: -200 },
      { month: "2026-02", spending: 0, income: 0, difference: 0 },
      { month: "2026-03", spending: 50, income: 0, difference: -50 },
    ]);
  });

  it("folds configured recurring income + one-off income into each cycle on top of marked credits", async () => {
    const repo = await freshHousehold();
    const [account] = await repo.accounts.create({ name: "Visa" });
    const [upload] = await repo.uploads.create({
      accountId: account.id,
      fileName: "s.csv",
      fileHash: "s",
    });
    const base = { accountId: account.id, uploadId: upload.id, rawCategory: "" };
    const [, salary] = await repo.transactions.createMany([
      { ...base, date: "2026-03-02", amount: -50, merchant: "BUS", sourceRow: 0 },
      // A marked card credit in March — configured income stacks on top of it.
      { ...base, date: "2026-03-10", amount: 20, merchant: "REFUND", sourceRow: 1 },
    ]);
    await repo.transactions.setIncomeMarked(salary.id, true);
    // A raise: 400 from the floor, rising to 500 effective 2026-03.
    await repo.savings.incomeSources.replace([
      { name: "Salary", amount: 400, effectiveFrom: "2026-01" },
      { name: "Salary", amount: 500, effectiveFrom: "2026-03" },
    ]);
    // A one-off bonus lands only on February.
    await repo.savings.oneOffAdjustments.replace([
      { cycleKey: "2026-02", kind: "income", amount: 30 },
    ]);

    const series = await loadMonthlySpendSeries(repo, NOW, 3);
    expect(series).toEqual([
      { month: "2026-01", spending: 0, income: 400, difference: 400 },
      { month: "2026-02", spending: 0, income: 430, difference: 430 },
      // 500 configured + 20 marked credit = 520; minus 50 spend.
      { month: "2026-03", spending: 50, income: 520, difference: 470 },
    ]);
  });

  it("never counts another household's transactions", async () => {
    const a = await freshHousehold();
    const b = await freshHousehold();
    const [accB] = await b.accounts.create({ name: "B-Visa" });
    const [upB] = await b.uploads.create({ accountId: accB.id, fileName: "b.csv", fileHash: "b" });
    await b.transactions.create({
      accountId: accB.id,
      uploadId: upB.id,
      date: "2026-03-12",
      amount: -777,
      merchant: "B-ONLY",
      rawCategory: "",
      sourceRow: 0,
    });

    const series = await loadMonthlySpendSeries(a, NOW, 3);
    expect(series).toEqual([
      { month: "2026-01", spending: 0, income: 0, difference: 0 },
      { month: "2026-02", spending: 0, income: 0, difference: 0 },
      { month: "2026-03", spending: 0, income: 0, difference: 0 },
    ]);
  });
});
