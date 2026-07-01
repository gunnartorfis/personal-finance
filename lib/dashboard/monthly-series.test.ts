import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { buildMonthlySpendSeries, loadMonthlySpendSeries } from "./monthly-series";

describe("buildMonthlySpendSeries", () => {
  it("is empty when there are no month keys", () => {
    expect(buildMonthlySpendSeries([{ month: "2026-03", spending: 1, moneyIn: 2 }], [])).toEqual([]);
  });

  it("fills missing months with zeros, keeps key order, and derives difference", () => {
    const series = buildMonthlySpendSeries(
      [
        { month: "2026-01", spending: 300, moneyIn: 100 },
        { month: "2026-03", spending: 0, moneyIn: 50 },
      ],
      ["2026-01", "2026-02", "2026-03"],
    );
    expect(series).toEqual([
      { month: "2026-01", spending: 300, moneyIn: 100, difference: -200 },
      { month: "2026-02", spending: 0, moneyIn: 0, difference: 0 },
      { month: "2026-03", spending: 0, moneyIn: 50, difference: 50 },
    ]);
  });

  it("ignores rows for months outside the requested window", () => {
    const series = buildMonthlySpendSeries(
      [
        { month: "2025-12", spending: 999, moneyIn: 999 },
        { month: "2026-02", spending: 200, moneyIn: 0 },
      ],
      ["2026-01", "2026-02"],
    );
    expect(series).toEqual([
      { month: "2026-01", spending: 0, moneyIn: 0, difference: 0 },
      { month: "2026-02", spending: 200, moneyIn: 0, difference: -200 },
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

  it("splits debits (spending) from credits (money in) per calendar month over the window", async () => {
    const repo = await freshHousehold();
    const [account] = await repo.accounts.create({ name: "Visa" });
    const [upload] = await repo.uploads.create({
      accountId: account.id,
      fileName: "s.csv",
      fileHash: "s",
    });
    const base = { accountId: account.id, uploadId: upload.id, rawCategory: "" };
    await repo.transactions.createMany([
      // January: two debits (spending 300) + one credit (money in 100)
      { ...base, date: "2026-01-05", amount: -200, merchant: "RENT", sourceRow: 0 },
      { ...base, date: "2026-01-20", amount: -100, merchant: "FOOD", sourceRow: 1 },
      { ...base, date: "2026-01-25", amount: 100, merchant: "REFUND", sourceRow: 2 },
      // February: nothing (must fill with zeros).
      // March: one debit (spending 50).
      { ...base, date: "2026-03-02", amount: -50, merchant: "BUS", sourceRow: 3 },
      // Out of the 3-month window (older) — excluded.
      { ...base, date: "2025-12-31", amount: -777, merchant: "OLD", sourceRow: 4 },
    ]);

    const series = await loadMonthlySpendSeries(repo, NOW, 3);
    expect(series).toEqual([
      { month: "2026-01", spending: 300, moneyIn: 100, difference: -200 },
      { month: "2026-02", spending: 0, moneyIn: 0, difference: 0 },
      { month: "2026-03", spending: 50, moneyIn: 0, difference: -50 },
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
      { month: "2026-01", spending: 0, moneyIn: 0, difference: 0 },
      { month: "2026-02", spending: 0, moneyIn: 0, difference: 0 },
      { month: "2026-03", spending: 0, moneyIn: 0, difference: 0 },
    ]);
  });
});
