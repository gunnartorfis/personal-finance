import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households, transactions } from "@/lib/db/schema";

import { financialHealthTool } from "./financial-health";
import { savingsStatusTool } from "./savings-status";
import { searchTransactionsTool } from "./search-transactions";
import { spendingTrendTool } from "./spending-trend";
import type { AssistantToolContext } from "./types";

const NOW = new Date("2026-03-15T00:00:00Z");

let db: ReturnType<typeof drizzle>;
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

async function newHousehold() {
  const [hh] = await db.insert(households).values({}).returning();
  return householdRepo(asRepoDb(db), hh.id);
}

/**
 * Feb: Netto 1000 Necessary. March: Netto 1500 Necessary, COSTCO 5000 Necessary, Kaffi 2000 Nice to
 * have, plus an EXCLUDED Kaffi 300. March counted spending = 8500 (excluded row drops).
 */
async function seedTx(): Promise<AssistantToolContext> {
  const repo = await newHousehold();
  const [acct] = await repo.accounts.create({ name: "Visa" });
  const [up] = await repo.uploads.create({ accountId: acct.id, fileName: "s.csv", fileHash: "tx" });
  const rows = [
    { date: "2026-02-20", amount: -1000, merchant: "Netto", type: "Necessary" as const, excluded: false },
    { date: "2026-03-05", amount: -1500, merchant: "Netto", type: "Necessary" as const, excluded: false },
    { date: "2026-03-10", amount: -5000, merchant: "COSTCO WHOLESALE 123", type: "Necessary" as const, excluded: false },
    { date: "2026-03-12", amount: -2000, merchant: "Kaffi", type: "Nice to have" as const, excluded: false },
    { date: "2026-03-15", amount: -300, merchant: "Kaffi", type: "Nice to have" as const, excluded: true },
  ];
  const created = await repo.transactions.createMany(
    rows.map((r, i) => ({ accountId: acct.id, uploadId: up.id, date: r.date, amount: r.amount, merchant: r.merchant, rawCategory: "", sourceRow: i })),
  );
  for (let i = 0; i < rows.length; i++) {
    await repo.transactions.classify(created[i].id, { expenseType: rows[i].type });
    if (rows[i].excluded) await db.update(transactions).set({ excluded: true }).where(eq(transactions.id, created[i].id));
  }
  return { repo, now: NOW };
}

describe("assistant status tools", () => {
  let tx: AssistantToolContext;

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
    tx = await seedTx();
  });

  describe("searchTransactions", () => {
    it("defaults to the trailing 3 cycles and returns all rows in it", async () => {
      const out = await searchTransactionsTool.run(tx, {});
      expect(out.count).toBe(5);
    });

    it("caps results at `limit`, reporting the true match count", async () => {
      const out = await searchTransactionsTool.run(tx, { limit: 2 });
      expect(out.transactions).toHaveLength(2);
      expect(out.count).toBe(5);
    });

    it("matches merchant text on the normalized name (store numbers stripped)", async () => {
      const out = await searchTransactionsTool.run(tx, { text: "costco" });
      expect(out.transactions).toHaveLength(1);
      expect(out.transactions[0]).toMatchObject({ amount: -5000 });
    });

    it("filters by amount magnitude", async () => {
      const out = await searchTransactionsTool.run(tx, { minAmount: 3000 });
      expect(out.transactions.map((t) => t.amount)).toEqual([-5000]);
    });

    it("filters by effective expense type", async () => {
      const out = await searchTransactionsTool.run(tx, { expenseType: "Necessary" });
      expect(out.count).toBe(3);
    });

    it("surfaces the excluded flag rather than hiding excluded rows", async () => {
      const out = await searchTransactionsTool.run(tx, { text: "kaffi" });
      expect(out.count).toBe(2);
      expect(out.transactions.some((t) => t.excluded)).toBe(true);
    });

    it("rejects a one-sided date window (from without to)", () => {
      expect(() => searchTransactionsTool.inputSchema.parse({ from: "2026-01-01" })).toThrow();
    });

    it("rejects an inverted date window (from after to)", () => {
      expect(() =>
        searchTransactionsTool.inputSchema.parse({ from: "2026-03-01", to: "2026-01-01" }),
      ).toThrow();
    });

    it("flags inter-account transfer legs so they aren't summed as spend", async () => {
      const repo = await newHousehold();
      const [acct] = await repo.accounts.create({ name: "Visa" });
      const [up] = await repo.uploads.create({ accountId: acct.id, fileName: "s.csv", fileHash: "xfer" });
      const [row] = await repo.transactions.createMany([
        { accountId: acct.id, uploadId: up.id, date: "2026-03-10", amount: -50000, merchant: "CARD PAYMENT", rawCategory: "", sourceRow: 0 },
      ]);
      await db
        .update(transactions)
        .set({ transferGroupId: "00000000-0000-0000-0000-0000000000ab" })
        .where(eq(transactions.id, row.id));
      const out = await searchTransactionsTool.run({ repo, now: NOW }, { cycle: "2026-03" });
      expect(out.transactions[0]).toMatchObject({ isTransfer: true, amount: -50000 });
    });
  });

  describe("getSpendingTrend", () => {
    it("returns the monthly series (excluded rows dropped) and trend stats", async () => {
      const out = await spendingTrendTool.run(tx, { months: 3 });
      const last = out.series.at(-1);
      expect(last?.month).toBe("2026-03");
      expect(last?.spending).toBe(8500);
      expect(out.series.find((p) => p.month === "2026-02")?.spending).toBe(1000);
      expect(typeof out.stats.hasEnoughHistory).toBe("boolean");
    });
  });

  describe("getSavingsStatus", () => {
    it("reports no goal when none is set", async () => {
      const repo = await newHousehold();
      const out = await savingsStatusTool.run({ repo, now: NOW }, {});
      expect(out).toEqual({ hasGoal: false });
    });

    it("summarizes an active goal", async () => {
      const repo = await newHousehold();
      await repo.savings.goal.upsert({ target: 1_000_000, targetDate: "2027-01-01", startCycle: "2026-01", currency: "ISK" });
      const out = await savingsStatusTool.run({ repo, now: NOW }, {});
      expect(out).toMatchObject({ hasGoal: true, target: 1_000_000, currency: "ISK" });
      expect(typeof out.onTrack).toBe("boolean");
      expect(typeof out.percent).toBe("number");
    });
  });

  describe("getFinancialHealth", () => {
    it("is null-safe with no history or balances", async () => {
      const repo = await newHousehold();
      const out = await financialHealthTool.run({ repo, now: NOW }, {});
      expect(out.hasEnoughHistory).toBe(false);
      expect(out.monthlyBurn).toBeNull();
      expect(out.netWorth).toBeNull();
      expect(out.runwayMonths).toBeNull();
    });

    it("reports net worth from the latest balances", async () => {
      const repo = await newHousehold();
      const [acct] = await repo.accounts.create({ name: "Savings" });
      await repo.accounts.balances.insert({ accountId: acct.id, balance: 500_000 });
      const out = await financialHealthTool.run({ repo, now: NOW }, {});
      expect(out.netWorth).toMatchObject({ total: 500_000, accountCount: 1 });
    });
  });
});
