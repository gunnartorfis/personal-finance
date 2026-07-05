import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { seedCategoriesForHousehold } from "@/lib/categories/seed-household";
import { householdRepo } from "@/lib/db/household-repo";
import { households, savingsIncomeSources, savingsOffcardCosts } from "@/lib/db/schema";

import { compareCyclesTool } from "./compare-cycles";
import { cycleSummaryTool } from "./cycle-summary";
import { spendByCategoryTool } from "./spend-by-category";
import { spendByTypeTool } from "./spend-by-type";
import { topMerchantsTool } from "./top-merchants";
import type { AssistantToolContext } from "./types";

// Mid-March so the "current cycle" resolves to 2026-03 when a tool is called with no cycle arg.
const NOW = new Date("2026-03-15T00:00:00Z");

let db: ReturnType<typeof drizzle>;
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

/**
 * One Household with two cycles: Feb spends 1500 (Netto 1000 Necessary, Kaffi 500 Nice to have),
 * March spends 3500 (Netto 1500 Necessary, Kaffi 2000 Nice to have) plus one UNMARKED credit (+300,
 * counts for nothing, ADR-0009). So March is 2000 higher, driven by Kaffi (+1500) then Netto (+500).
 */
async function seedContext(authUserId: string): Promise<AssistantToolContext> {
  const [hh] = await db.insert(households).values({}).returning();
  const repo = householdRepo(asRepoDb(db), hh.id);
  const [acct] = await repo.accounts.create({ name: "Visa" });
  const [up] = await repo.uploads.create({ accountId: acct.id, fileName: "s.csv", fileHash: authUserId });
  const rows = [
    { date: "2026-02-10", amount: -1000, merchant: "Netto", type: "Necessary" as const },
    { date: "2026-02-12", amount: -500, merchant: "Kaffi", type: "Nice to have" as const },
    { date: "2026-03-10", amount: -1500, merchant: "Netto", type: "Necessary" as const },
    { date: "2026-03-12", amount: -2000, merchant: "Kaffi", type: "Nice to have" as const },
    { date: "2026-03-20", amount: 300, merchant: "Refund", type: "" as const },
  ];
  const created = await repo.transactions.createMany(
    rows.map((r, i) => ({
      accountId: acct.id,
      uploadId: up.id,
      date: r.date,
      amount: r.amount,
      merchant: r.merchant,
      rawCategory: "",
      sourceRow: i,
    })),
  );
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].amount < 0) await repo.transactions.classify(created[i].id, { expenseType: rows[i].type });
  }
  return { repo, now: NOW };
}

/**
 * A Household with configured off-card amounts (5000 income, 1500 off-card fixed) and March card
 * spend of 3500 — so the folded figures should match the Transactions overview, not the raw card sum.
 */
async function seedConfigured(authUserId: string): Promise<AssistantToolContext> {
  const [hh] = await db.insert(households).values({}).returning();
  const repo = householdRepo(asRepoDb(db), hh.id);
  const [acct] = await repo.accounts.create({ name: "Visa" });
  const [up] = await repo.uploads.create({ accountId: acct.id, fileName: "s.csv", fileHash: authUserId });
  const created = await repo.transactions.createMany([
    { accountId: acct.id, uploadId: up.id, date: "2026-03-10", amount: -1500, merchant: "Netto", rawCategory: "", sourceRow: 0 },
    { accountId: acct.id, uploadId: up.id, date: "2026-03-12", amount: -2000, merchant: "Kaffi", rawCategory: "", sourceRow: 1 },
  ]);
  await repo.transactions.classify(created[0].id, { expenseType: "Necessary" });
  await repo.transactions.classify(created[1].id, { expenseType: "Nice to have" });
  await db.insert(savingsIncomeSources).values({ householdId: hh.id, name: "Salary", amount: 5000 });
  await db.insert(savingsOffcardCosts).values({ householdId: hh.id, name: "Rent", monthlyAmount: 1500 });
  return { repo, now: NOW };
}

/**
 * A Household with a debit explicitly bucketed as "" (not-bucketed): Feb Necessary 1000; March
 * Necessary 1000 + a "" debit 800. The "" row is excluded from the merchant query but counts in the
 * totals — the exact residual `unclassifiedDelta` exists to surface.
 */
async function seedUnclassified(authUserId: string): Promise<AssistantToolContext> {
  const [hh] = await db.insert(households).values({}).returning();
  const repo = householdRepo(asRepoDb(db), hh.id);
  const [acct] = await repo.accounts.create({ name: "Visa" });
  const [up] = await repo.uploads.create({ accountId: acct.id, fileName: "s.csv", fileHash: authUserId });
  const created = await repo.transactions.createMany([
    { accountId: acct.id, uploadId: up.id, date: "2026-02-10", amount: -1000, merchant: "Netto", rawCategory: "", sourceRow: 0 },
    { accountId: acct.id, uploadId: up.id, date: "2026-03-10", amount: -1000, merchant: "Netto", rawCategory: "", sourceRow: 1 },
    { accountId: acct.id, uploadId: up.id, date: "2026-03-15", amount: -800, merchant: "Mystery", rawCategory: "", sourceRow: 2 },
  ]);
  await repo.transactions.classify(created[0].id, { expenseType: "Necessary" });
  await repo.transactions.classify(created[1].id, { expenseType: "Necessary" });
  await repo.transactions.classify(created[2].id, { expenseType: "" });
  return { repo, now: NOW };
}

describe("assistant cycle tools", () => {
  let ctx: AssistantToolContext;

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
    ctx = await seedContext("cycle-tools");
  });

  describe("getCycleSummary", () => {
    it("summarizes spending / income / difference for an explicit cycle", async () => {
      const out = await cycleSummaryTool.run(ctx, { cycle: "2026-03" });
      expect(out).toMatchObject({ cycle: "2026-03", spending: 3500, income: 0, difference: -3500 });
    });

    it("defaults to the current cycle from `now`", async () => {
      const out = await cycleSummaryTool.run(ctx, {});
      expect(out.cycle).toBe("2026-03");
      expect(out.spending).toBe(3500);
    });

    it("rejects a malformed cycle key", () => {
      expect(() => cycleSummaryTool.inputSchema.parse({ cycle: "March" })).toThrow();
    });
  });

  describe("spendByType", () => {
    it("breaks spend into the real buckets as positive magnitudes", async () => {
      const out = await spendByTypeTool.run(ctx, { cycle: "2026-03" });
      expect(out.byType).toEqual({ Fixed: 0, Necessary: 1500, "Nice to have": 2000 });
      expect(out.unclassified).toBe(0);
      expect(out.totalSpending).toBe(3500);
    });
  });

  describe("topMerchants", () => {
    it("ranks merchants by spend with a share of the period", async () => {
      const out = await topMerchantsTool.run(ctx, { cycle: "2026-03", limit: 5 });
      expect(out.merchants.map((m) => m.merchant)).toEqual(["KAFFI", "NETTO"]);
      expect(out.merchants[0]).toMatchObject({ spending: 2000 });
      expect(out.merchants[0].share).toBeCloseTo(2000 / 3500, 5);
    });
  });

  describe("compareCycles", () => {
    it("explains why a cycle differs from its baseline (defaults to previous cycle)", async () => {
      const out = await compareCyclesTool.run(ctx, { cycle: "2026-03" });
      expect(out.cycle).toMatchObject({ key: "2026-03", spending: 3500 });
      expect(out.baseline).toMatchObject({ key: "2026-02", spending: 1500 });
      expect(out.spendingDelta).toBe(2000);
      expect(out.byTypeDelta).toEqual({ Fixed: 0, Necessary: 500, "Nice to have": 1500 });
      expect(out.topRisers.map((r) => r.merchant)).toEqual(["KAFFI", "NETTO"]);
      expect(out.topRisers[0]).toMatchObject({ delta: 1500, cycleSpending: 2000, baselineSpending: 500 });
    });

    it("accepts an explicit baseline", async () => {
      const out = await compareCyclesTool.run(ctx, { cycle: "2026-03", baseline: "2026-02" });
      expect(out.baseline.key).toBe("2026-02");
    });
  });

  describe("configured off-card amounts (ADR-0015) — matches the Transactions overview", () => {
    let cfg: AssistantToolContext;
    beforeAll(async () => {
      cfg = await seedConfigured("configured");
    });

    it("getCycleSummary folds in configured income and off-card fixed costs", async () => {
      const out = await cycleSummaryTool.run(cfg, { cycle: "2026-03" });
      // card spend 3500 + 1500 off-card rent = 5000; income 0 marked + 5000 configured; difference 0.
      expect(out).toMatchObject({ spending: 5000, income: 5000, difference: 0 });
    });

    it("spendByType folds off-card fixed costs into the Fixed bucket", async () => {
      const out = await spendByTypeTool.run(cfg, { cycle: "2026-03" });
      expect(out.byType).toEqual({ Fixed: 1500, Necessary: 1500, "Nice to have": 2000 });
      expect(out.totalSpending).toBe(5000);
    });
  });

  describe("unclassified residual", () => {
    let un: AssistantToolContext;
    beforeAll(async () => {
      un = await seedUnclassified("unclassified");
    });

    it("spendByType surfaces not-bucketed spend separately from the buckets", async () => {
      const out = await spendByTypeTool.run(un, { cycle: "2026-03" });
      expect(out.byType).toEqual({ Fixed: 0, Necessary: 1000, "Nice to have": 0 });
      expect(out.unclassified).toBe(800);
      expect(out.totalSpending).toBe(1800);
    });

    it("compareCycles reports the unclassified delta the merchant risers can't explain", async () => {
      const out = await compareCyclesTool.run(un, { cycle: "2026-03", baseline: "2026-02" });
      expect(out.spendingDelta).toBe(800); // 1800 vs 1000
      expect(out.unclassifiedDelta).toBe(800); // the "" row, absent from topRisers
      expect(out.topRisers).toHaveLength(0); // Netto flat (1000→1000), Mystery excluded as not-bucketed
    });
  });
});

describe("spendByCategory (ADR-0020)", () => {
  // Self-contained DB init so this block runs standalone (e.g. `vitest -t "splits spend by category"`)
  // without depending on a sibling describe's beforeAll.
  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  async function seedCategoryContext(authUserId: string): Promise<AssistantToolContext> {
    const [hh] = await db.insert(households).values({}).returning();
    await seedCategoriesForHousehold(asRepoDb(db), hh.id);
    const repo = householdRepo(asRepoDb(db), hh.id);
    const slugToId = await repo.categories.leafSlugToId();
    const [acct] = await repo.accounts.create({ name: "Visa" });
    const [up] = await repo.uploads.create({ accountId: acct.id, fileName: "c.csv", fileHash: authUserId });
    const rows = [
      { amount: -1000, merchant: "Netto", cat: "groceries" },
      { amount: -1500, merchant: "Bonus", cat: "groceries" },
      { amount: -3000, merchant: "N1", cat: "fuel" },
      { amount: -800, merchant: "Mystery", cat: null }, // classified type, no category → uncategorized
    ];
    const created = await repo.transactions.createMany(
      rows.map((r, i) => ({
        accountId: acct.id,
        uploadId: up.id,
        date: "2026-03-10",
        amount: r.amount,
        merchant: r.merchant,
        rawCategory: "",
        sourceRow: i,
      })),
    );
    for (let i = 0; i < rows.length; i++) {
      const catId = rows[i].cat ? slugToId.get(rows[i].cat!) : null;
      await repo.transactions.classify(created[i].id, {
        expenseType: "Necessary",
        categoryId: catId,
        categoryConfidence: catId ? 0.9 : undefined,
      });
    }
    return { repo, now: NOW };
  }

  it("splits spend by category slug, with uncategorized and total kept separate", async () => {
    const ctx = await seedCategoryContext("spend-by-category");
    const out = await spendByCategoryTool.run(ctx, { cycle: "2026-03" });
    expect(out.cycle).toBe("2026-03");
    expect(out.byCategory).toEqual({ groceries: 2500, fuel: 3000 });
    expect(out.uncategorized).toBe(800);
    expect(out.totalSpending).toBe(6300);
  });
})
