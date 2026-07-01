import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import type { CategoryTrendPoint } from "./category-trend";
import {
  categoryEntityRows,
  computeMovers,
  loadBiggestMovers,
  loadLargestCharge,
} from "./movers";

const KEYS = ["2026-01", "2026-02", "2026-03"];

describe("computeMovers", () => {
  it("finds risers vs the pre-last baseline, drops decliners, sorts by delta desc", () => {
    const rows = [
      { name: "BONUS", month: "2026-01", spending: 100 },
      { name: "BONUS", month: "2026-02", spending: 200 },
      { name: "BONUS", month: "2026-03", spending: 500 }, // baseline (100,200)=150, last 500
      { name: "NETTO", month: "2026-01", spending: 300 },
      { name: "NETTO", month: "2026-02", spending: 300 },
      { name: "NETTO", month: "2026-03", spending: 100 }, // decliner -> dropped
      { name: "N1", month: "2026-03", spending: 200 }, // baseline 0 -> deltaPct null
    ];
    expect(computeMovers(rows, KEYS, 3)).toEqual([
      { name: "BONUS", lastMonth: 500, baselineAverage: 150, delta: 350, deltaPct: 233 },
      { name: "N1", lastMonth: 200, baselineAverage: 0, delta: 200, deltaPct: null },
    ]);
  });

  it("respects the limit", () => {
    const rows = [
      { name: "BONUS", month: "2026-01", spending: 100 },
      { name: "BONUS", month: "2026-03", spending: 500 },
      { name: "N1", month: "2026-03", spending: 200 },
    ];
    expect(computeMovers(rows, KEYS, 1)).toEqual([
      { name: "BONUS", lastMonth: 500, baselineAverage: 50, delta: 450, deltaPct: 900 },
    ]);
  });

  it("accumulates duplicate (name, month) rows", () => {
    const rows = [
      { name: "BONUS", month: "2026-01", spending: 100 },
      { name: "BONUS", month: "2026-03", spending: 300 },
      { name: "BONUS", month: "2026-03", spending: 200 }, // same month -> 500 total
    ];
    expect(computeMovers(rows, KEYS, 3)[0]).toMatchObject({ lastMonth: 500, delta: 450 });
  });

  it("breaks ties by name", () => {
    const rows = [
      { name: "ZED", month: "2026-03", spending: 100 },
      { name: "ALPHA", month: "2026-03", spending: 100 },
    ];
    expect(computeMovers(rows, KEYS, 3).map((m) => m.name)).toEqual(["ALPHA", "ZED"]);
  });

  it("returns nothing without at least two completed months (no baseline)", () => {
    expect(computeMovers([{ name: "X", month: "2026-01", spending: 9 }], ["2026-01"], 3)).toEqual([]);
  });
});

describe("categoryEntityRows", () => {
  it("emits the three named spend categories per month (excludes '' and unclassified)", () => {
    const trend: CategoryTrendPoint[] = [
      {
        month: "2026-01",
        byExpenseType: { Fixed: 300, Necessary: 0, "Nice to have": 0, "": 99 },
        unclassified: 77,
      },
    ];
    expect(categoryEntityRows(trend)).toEqual([
      { name: "Fixed", month: "2026-01", spending: 300 },
      { name: "Necessary", month: "2026-01", spending: 0 },
      { name: "Nice to have", month: "2026-01", spending: 0 },
    ]);
  });
});

describe("loadBiggestMovers / loadLargestCharge", () => {
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

  const NOW = new Date("2026-03-15T12:00:00Z"); // current cycle 2026-03

  it("computes merchant + category movers over the active completed months and the current-cycle largest charge", async () => {
    const repo = await freshHousehold();
    const [account] = await repo.accounts.create({ name: "Visa" });
    const [upload] = await repo.uploads.create({
      accountId: account.id,
      fileName: "mv.csv",
      fileHash: "mv",
    });
    const base = { accountId: account.id, uploadId: upload.id, rawCategory: "" };
    const [jan, feb, big] = await repo.transactions.createMany([
      // Only Jan + Feb have history (9 earlier window months are empty and must be trimmed away).
      { ...base, date: "2026-01-10", amount: -100, merchant: "BONUS 0123", sourceRow: 0 },
      { ...base, date: "2026-02-10", amount: -400, merchant: "bonus 4567", sourceRow: 1 },
      // Current cycle (2026-03): the largest charge; not a "completed" month so not a mover.
      { ...base, date: "2026-03-05", amount: -600, merchant: "BIGSHOP", sourceRow: 2 },
      { ...base, date: "2026-03-06", amount: -50, merchant: "CORNER", sourceRow: 3 },
    ]);
    await repo.transactions.classify(jan.id, { expenseType: "Necessary" });
    await repo.transactions.classify(feb.id, { expenseType: "Necessary" });
    await repo.transactions.classify(big.id, { expenseType: "Nice to have" });

    const movers = await loadBiggestMovers(repo, NOW, 12);
    expect(movers.merchants).toEqual([
      { name: "BONUS", lastMonth: 400, baselineAverage: 100, delta: 300, deltaPct: 300 },
    ]);
    expect(movers.categories).toEqual([
      { name: "Necessary", lastMonth: 400, baselineAverage: 100, delta: 300, deltaPct: 300 },
    ]);

    expect(await loadLargestCharge(repo, NOW)).toEqual({ merchant: "BIGSHOP", amount: 600 });
  });

  it("is empty / null for a household with no transactions", async () => {
    const repo = await freshHousehold();
    expect(await loadBiggestMovers(repo, NOW, 12)).toEqual({ merchants: [], categories: [] });
    expect(await loadLargestCharge(repo, NOW)).toBeNull();
  });
});
