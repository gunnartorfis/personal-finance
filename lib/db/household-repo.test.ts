import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { seedCategoriesForHousehold } from "@/lib/categories/seed-household";

import { householdRepo } from "./household-repo";
import { categories, households } from "./schema";
import { and, eq } from "drizzle-orm";

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

describe("householdRepo", () => {
  it("stamps the bound householdId on create", async () => {
    const { a, aId } = await twoHouseholds();
    const [account] = await a.accounts.create({ name: "Visa" });
    expect(account.householdId).toBe(aId);
  });

  it("scopes account lists to the bound household", async () => {
    const { a, b } = await twoHouseholds();
    await a.accounts.create({ name: "A-Visa" });
    await b.accounts.create({ name: "B-Visa" });
    const aAccounts = await a.accounts.list();
    expect(aAccounts).toHaveLength(1);
    expect(aAccounts[0].name).toBe("A-Visa");
  });

  it("scopes uploads and transactions to the bound household", async () => {
    const { a, b } = await twoHouseholds();
    const [account] = await a.accounts.create({ name: "Visa" });
    const [upload] = await a.uploads.create({
      accountId: account.id,
      fileName: "mar.csv",
      fileHash: "hash-a",
    });
    await a.transactions.create({
      accountId: account.id,
      uploadId: upload.id,
      date: "2026-03-01",
      amount: -1990,
      merchant: "NETFLIX",
      rawCategory: "Afþreying",
      sourceRow: 0,
    });
    expect(await a.transactions.list()).toHaveLength(1);
    expect(await b.transactions.list()).toHaveLength(0);
    expect(await b.uploads.list()).toHaveLength(0);
  });

  it("scopes merchant rules to the bound household", async () => {
    const { a, b } = await twoHouseholds();
    await a.merchantRules.create({ merchant: "NETFLIX", flatType: "Fixed" });
    expect(await a.merchantRules.list()).toHaveLength(1);
    expect(await b.merchantRules.list()).toHaveLength(0);
  });

  it("removes a merchant rule, scoped to the household", async () => {
    const { a, b } = await twoHouseholds();
    const [rule] = await a.merchantRules.create({ merchant: "NETFLIX", flatType: "Fixed" });
    // Another household cannot remove it.
    expect(await b.merchantRules.remove(rule.id)).toHaveLength(0);
    expect(await a.merchantRules.list()).toHaveLength(1);
    // The owner can.
    expect(await a.merchantRules.remove(rule.id)).toHaveLength(1);
    expect(await a.merchantRules.list()).toHaveLength(0);
  });

  it("scopes overrides to the bound household", async () => {
    const { a, b } = await twoHouseholds();
    const [account] = await a.accounts.create({ name: "Visa" });
    const [upload] = await a.uploads.create({
      accountId: account.id,
      fileName: "f.csv",
      fileHash: "ovr",
    });
    const [txn] = await a.transactions.create({
      accountId: account.id,
      uploadId: upload.id,
      date: "2026-03-01",
      amount: -1990,
      merchant: "NETFLIX",
      rawCategory: "Afþreying",
      sourceRow: 0,
    });
    await a.overrides.create({ transactionId: txn.id, expenseType: "Necessary" });
    expect(await a.overrides.list()).toHaveLength(1);
    expect(await b.overrides.list()).toHaveLength(0);
  });

  it("lists transactions in a cycle with their override joined, scoped + range-filtered", async () => {
    const { a, b } = await twoHouseholds();
    const [account] = await a.accounts.create({ name: "Visa" });
    const [upload] = await a.uploads.create({
      accountId: account.id,
      fileName: "mar.csv",
      fileHash: "lwo",
    });
    const base = {
      accountId: account.id,
      uploadId: upload.id,
      rawCategory: "x",
    };
    const [inRange] = await a.transactions.create({
      ...base,
      date: "2026-03-15",
      amount: -1990,
      merchant: "NETFLIX",
      sourceRow: 0,
    });
    await a.transactions.create({
      ...base,
      date: "2026-02-28", // before the range
      amount: -500,
      merchant: "OLD",
      sourceRow: 1,
    });
    await a.overrides.create({ transactionId: inRange.id, expenseType: "Necessary" });

    const range = { from: "2026-03-01", to: "2026-04-01" };
    const rows = await a.transactions.listWithOverrides(range);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: inRange.id,
      merchant: "NETFLIX",
      amount: -1990,
      overrideType: "Necessary",
    });
    // Another household sees nothing through its own repo.
    expect(await b.transactions.listWithOverrides(range)).toHaveLength(0);
  });

  it("lists distinct cycle months that have data, newest first and scoped", async () => {
    const { a, b } = await twoHouseholds();
    const [account] = await a.accounts.create({ name: "Visa" });
    const [upload] = await a.uploads.create({
      accountId: account.id,
      fileName: "c.csv",
      fileHash: "cyc",
    });
    const base = { accountId: account.id, uploadId: upload.id, rawCategory: "x" };
    // Two rows in March, one in January — January and March are the distinct months.
    await a.transactions.create({ ...base, date: "2026-03-15", amount: -10, merchant: "M1", sourceRow: 0 });
    await a.transactions.create({ ...base, date: "2026-03-02", amount: -20, merchant: "M2", sourceRow: 1 });
    await a.transactions.create({ ...base, date: "2026-01-09", amount: -30, merchant: "M3", sourceRow: 2 });

    expect(await a.transactions.cycleMonths()).toEqual(["2026-03", "2026-01"]);
    // Another household sees none of A's months.
    expect(await b.transactions.cycleMonths()).toEqual([]);
  });

  describe("review queue", () => {
    /** Seed one expense in household `a` on `date`; optionally override it (settling it). */
    async function seedExpense(
      a: Awaited<ReturnType<typeof twoHouseholds>>["a"],
      opts: { date: string; amount?: number; sourceRow: number; override?: boolean },
    ) {
      const [account] = await a.accounts.create({ name: `Visa-${opts.sourceRow}` });
      const [upload] = await a.uploads.create({
        accountId: account.id,
        fileName: "q.csv",
        fileHash: `q-${opts.sourceRow}`,
      });
      const [txn] = await a.transactions.create({
        accountId: account.id,
        uploadId: upload.id,
        date: opts.date,
        amount: opts.amount ?? -1000,
        merchant: `M${opts.sourceRow}`,
        rawCategory: "",
        sourceRow: opts.sourceRow,
      });
      if (opts.override) {
        await a.overrides.upsert({ transactionId: txn.id, expenseType: "Necessary" });
      }
      return txn;
    }

    it("groups unreviewed expenses by month, newest-first, scoped to the household", async () => {
      const { a, b } = await twoHouseholds();
      // March: one open expense + one already overridden (settled — must not count).
      await seedExpense(a, { date: "2026-03-15", sourceRow: 0 });
      await seedExpense(a, { date: "2026-03-20", sourceRow: 1, override: true });
      // January: two open expenses.
      await seedExpense(a, { date: "2026-01-05", sourceRow: 2 });
      await seedExpense(a, { date: "2026-01-09", sourceRow: 3 });
      // A credit is not an expense — excluded.
      await seedExpense(a, { date: "2026-03-01", amount: 5000, sourceRow: 4 });
      // Another household's open expense must not leak.
      await seedExpense(b, { date: "2026-03-15", sourceRow: 0 });

      expect(await a.transactions.reviewQueueMonths()).toEqual([
        { month: "2026-03", count: 1 },
        { month: "2026-01", count: 2 },
      ]);
    });

    it("returns the full unreviewed-expense rows across all months, newest-first", async () => {
      const { a } = await twoHouseholds();
      await seedExpense(a, { date: "2026-03-15", sourceRow: 0 });
      await seedExpense(a, { date: "2026-01-09", sourceRow: 1 });
      const settled = await seedExpense(a, { date: "2026-02-01", sourceRow: 2, override: true });
      await seedExpense(a, { date: "2026-03-02", amount: 5000, sourceRow: 3 }); // credit

      const queue = await a.transactions.reviewQueue();
      expect(queue.map((r) => r.merchant)).toEqual(["M0", "M1"]); // newest-first, no credit
      expect(queue.every((r) => r.overrideType === null)).toBe(true);
      expect(queue.some((r) => r.id === settled.id)).toBe(false);
    });

    it("caps the queue to the requested limit, keeping the newest rows", async () => {
      const { a } = await twoHouseholds();
      await seedExpense(a, { date: "2026-03-15", sourceRow: 0 });
      await seedExpense(a, { date: "2026-02-15", sourceRow: 1 });
      await seedExpense(a, { date: "2026-01-15", sourceRow: 2 });

      const capped = await a.transactions.reviewQueue(2);
      expect(capped.map((r) => r.merchant)).toEqual(["M0", "M1"]); // newest two
      // No limit still returns everything.
      expect(await a.transactions.reviewQueue()).toHaveLength(3);
    });

    it("excludes an expense once it is overridden", async () => {
      const { a } = await twoHouseholds();
      const txn = await seedExpense(a, { date: "2026-03-15", sourceRow: 0 });
      expect(await a.transactions.reviewQueueMonths()).toEqual([{ month: "2026-03", count: 1 }]);
      await a.overrides.upsert({ transactionId: txn.id, expenseType: "Fixed" });
      expect(await a.transactions.reviewQueueMonths()).toEqual([]);
      expect(await a.transactions.reviewQueue()).toHaveLength(0);
    });

    it("surfaces a low-confidence classification but keeps a confident one settled", async () => {
      const { a } = await twoHouseholds();
      const weak = await seedExpense(a, { date: "2026-03-15", sourceRow: 0 });
      const strong = await seedExpense(a, { date: "2026-03-16", sourceRow: 1 });
      // Below the 0.7 ceiling -> worth a human glance; at/above -> trusted and out of the queue.
      await a.transactions.classify(weak.id, { expenseType: "Necessary", confidence: 0.4 });
      await a.transactions.classify(strong.id, { expenseType: "Fixed", confidence: 0.9 });

      const queue = await a.transactions.reviewQueue();
      expect(queue.map((r) => r.id)).toEqual([weak.id]);
      expect(await a.transactions.reviewQueueMonths()).toEqual([{ month: "2026-03", count: 1 }]);
    });
  });

  it("findById returns a row in the household but not one from another", async () => {
    const { a, b } = await twoHouseholds();
    const [account] = await a.accounts.create({ name: "Visa" });
    expect((await a.accounts.findById(account.id))?.name).toBe("Visa");
    // B cannot read A's account by id — scoping returns undefined, not the row.
    expect(await b.accounts.findById(account.id)).toBeUndefined();
  });

  describe("merchant/charge spend excludes split (override → \"\")", () => {
    async function seed(a: Awaited<ReturnType<typeof twoHouseholds>>["a"]) {
      const [account] = await a.accounts.create({ name: "Visa" });
      const [upload] = await a.uploads.create({
        accountId: account.id,
        fileName: "s.csv",
        fileHash: "split",
      });
      const base = { accountId: account.id, uploadId: upload.id, rawCategory: "x" };
      // A big charge the user later splits (override → ""), plus an ordinary one.
      const [split] = await a.transactions.create({
        ...base,
        date: "2026-03-10",
        amount: -145_144,
        merchant: "ORMSSON HF",
        sourceRow: 0,
      });
      await a.transactions.create({
        ...base,
        date: "2026-03-11",
        amount: -2000,
        merchant: "NETTO",
        sourceRow: 1,
      });
      await a.overrides.upsert({ transactionId: split.id, expenseType: "" });
    }

    const range = { from: "2026-03-01", to: "2026-04-01" };

    it("monthlyMerchantSpend drops the split merchant", async () => {
      const { a } = await twoHouseholds();
      await seed(a);
      const rows = await a.transactions.monthlyMerchantSpend(range);
      expect(rows.map((r) => r.merchant)).toEqual(["NETTO"]);
    });

    it("topMerchants drops the split merchant", async () => {
      const { a } = await twoHouseholds();
      await seed(a);
      const rows = await a.transactions.topMerchants(range);
      expect(rows.map((r) => r.merchant)).toEqual(["NETTO"]);
    });

    it("largestCharge ignores the split charge", async () => {
      const { a } = await twoHouseholds();
      await seed(a);
      const row = await a.transactions.largestCharge(range);
      expect(row).toEqual({ merchant: "NETTO", amount: 2000 });
    });

    it("spendByAccount omits the split charge from the account total", async () => {
      const { a } = await twoHouseholds();
      await seed(a);
      const rows = await a.transactions.spendByAccount(range);
      // Single seeded account; only the non-split NETTO charge counts.
      expect(rows).toHaveLength(1);
      expect(rows[0].spending).toBe(2000);
    });
  });

  describe("overrides.upsert / remove", () => {
    async function seedTransaction(a: Awaited<ReturnType<typeof twoHouseholds>>["a"]) {
      const [account] = await a.accounts.create({ name: "Visa" });
      const [upload] = await a.uploads.create({
        accountId: account.id,
        fileName: "o.csv",
        fileHash: `ovr-${account.id}`,
      });
      const [txn] = await a.transactions.create({
        accountId: account.id,
        uploadId: upload.id,
        date: "2026-03-01",
        amount: -1990,
        merchant: "NETFLIX",
        rawCategory: "",
        sourceRow: 0,
      });
      return txn;
    }

    it("inserts then updates a single override per transaction", async () => {
      const { a, aId } = await twoHouseholds();
      const txn = await seedTransaction(a);

      const [created] = await a.overrides.upsert({ transactionId: txn.id, expenseType: "Necessary" });
      expect(created.householdId).toBe(aId);
      expect(created.expenseType).toBe("Necessary");

      const [updated] = await a.overrides.upsert({ transactionId: txn.id, expenseType: "Nice to have" });
      expect(updated.id).toBe(created.id); // same row, not a duplicate
      expect(updated.expenseType).toBe("Nice to have");
      expect(await a.overrides.list()).toHaveLength(1);
    });

    it("findByTransactionId returns the override and remove reverts it", async () => {
      const { a } = await twoHouseholds();
      const txn = await seedTransaction(a);
      await a.overrides.upsert({ transactionId: txn.id, expenseType: "Fixed" });

      expect((await a.overrides.findByTransactionId(txn.id))?.expenseType).toBe("Fixed");
      const removed = await a.overrides.remove(txn.id);
      expect(removed).toHaveLength(1);
      expect(await a.overrides.findByTransactionId(txn.id)).toBeUndefined();
      // Removing again is a no-op.
      expect(await a.overrides.remove(txn.id)).toHaveLength(0);
    });

    it("scopes override reads to the bound household", async () => {
      const { a, b } = await twoHouseholds();
      const txn = await seedTransaction(a);
      await a.overrides.upsert({ transactionId: txn.id, expenseType: "Fixed" });
      expect(await b.overrides.findByTransactionId(txn.id)).toBeUndefined();
      expect(await b.overrides.remove(txn.id)).toHaveLength(0);
    });
  });

  describe("transactions.setExcluded", () => {
    const range = { from: "2026-03-01", to: "2026-04-01" };
    async function seed(a: Awaited<ReturnType<typeof twoHouseholds>>["a"]) {
      const [account] = await a.accounts.create({ name: "Visa" });
      const [upload] = await a.uploads.create({
        accountId: account.id,
        fileName: "e.csv",
        fileHash: `exc-${account.id}`,
      });
      return { accountId: account.id, uploadId: upload.id };
    }

    it("drops an excluded debit from the net summary rows and spend series", async () => {
      const { a } = await twoHouseholds();
      const { accountId, uploadId } = await seed(a);
      const [txn] = await a.transactions.create({
        accountId,
        uploadId,
        date: "2026-03-10",
        amount: -5000,
        merchant: "VACUUM",
        rawCategory: "",
        sourceRow: 0,
        classificationStatus: "classified",
        expenseType: "Nice to have",
      });
      expect(await a.transactions.summaryRows(range)).toHaveLength(1);

      const [excluded] = await a.transactions.setExcluded(txn.id, true, "grandma's vacuum");
      expect(excluded.excluded).toBe(true);
      expect(excluded.exclusionNote).toBe("grandma's vacuum");
      expect(await a.transactions.summaryRows(range)).toHaveLength(0);
      expect(await a.transactions.monthlySpendSeries(range)).toHaveLength(0);

      // Re-including brings it back into the calculations and clears the note.
      const [reincluded] = await a.transactions.setExcluded(txn.id, false);
      expect(reincluded.excluded).toBe(false);
      expect(reincluded.exclusionNote).toBeNull();
      expect(await a.transactions.summaryRows(range)).toHaveLength(1);
    });

    it("clears an income mark when excluding a credit (mutually exclusive)", async () => {
      const { a } = await twoHouseholds();
      const { accountId, uploadId } = await seed(a);
      const [credit] = await a.transactions.create({
        accountId,
        uploadId,
        date: "2026-03-12",
        amount: 8000,
        merchant: "REFUND",
        rawCategory: "",
        sourceRow: 1,
        incomeMarked: true,
        classificationStatus: "classified",
        expenseType: "",
      });
      const [excluded] = await a.transactions.setExcluded(credit.id, true);
      expect(excluded.excluded).toBe(true);
      expect(excluded.incomeMarked).toBe(false);
    });

    it("re-including a formerly income-marked credit does NOT restore the mark (fresh state)", async () => {
      const { a } = await twoHouseholds();
      const { accountId, uploadId } = await seed(a);
      const [credit] = await a.transactions.create({
        accountId,
        uploadId,
        date: "2026-03-12",
        amount: 8000,
        merchant: "REFUND",
        rawCategory: "",
        sourceRow: 1,
        incomeMarked: true,
        classificationStatus: "classified",
        expenseType: "",
      });
      await a.transactions.setExcluded(credit.id, true);
      // Re-including returns the row to the default credit state (unmarked), by design (ADR-0011):
      // there is no stored prior state to restore, and re-inclusion is a fresh decision.
      const [reincluded] = await a.transactions.setExcluded(credit.id, false);
      expect(reincluded.excluded).toBe(false);
      expect(reincluded.incomeMarked).toBe(false);
    });

    it("scopes the update to the bound household", async () => {
      const { a, b } = await twoHouseholds();
      const { accountId, uploadId } = await seed(a);
      const [txn] = await a.transactions.create({
        accountId,
        uploadId,
        date: "2026-03-10",
        amount: -100,
        merchant: "X",
        rawCategory: "",
        sourceRow: 0,
      });
      expect(await b.transactions.setExcluded(txn.id, true)).toHaveLength(0);
    });

    it("setIncomeMarked no-ops on an excluded credit (mutually exclusive, no CHECK trip)", async () => {
      const { a } = await twoHouseholds();
      const { accountId, uploadId } = await seed(a);
      const [credit] = await a.transactions.create({
        accountId,
        uploadId,
        date: "2026-03-12",
        amount: 8000,
        merchant: "REFUND",
        rawCategory: "",
        sourceRow: 1,
        excluded: true,
      });
      // Marking an excluded credit as income would violate the CHECK; the WHERE guard makes it a
      // no-op instead (empty result → the route 404s rather than 500ing on a concurrent exclude).
      expect(await a.transactions.setIncomeMarked(credit.id, true)).toHaveLength(0);
    });

    it("excluding a Shared expense clears its Own share (ADR-0014, no CHECK trip)", async () => {
      const { a } = await twoHouseholds();
      const { accountId, uploadId } = await seed(a);
      const [txn] = await a.transactions.create({
        accountId,
        uploadId,
        date: "2026-03-10",
        amount: -200_000,
        merchant: "GROUP GIFT",
        rawCategory: "",
        sourceRow: 0,
        ownShareAmount: -28_571,
      });
      const [excluded] = await a.transactions.setExcluded(txn.id, true);
      expect(excluded.excluded).toBe(true);
      expect(excluded.ownShareAmount).toBeNull();
    });
  });

  describe("transactions.setOwnShare (ADR-0014)", () => {
    const range = { from: "2026-03-01", to: "2026-04-01" };
    async function seedDebit(
      a: Awaited<ReturnType<typeof twoHouseholds>>["a"],
      amount: number
    ) {
      const [account] = await a.accounts.create({ name: "Visa" });
      const [upload] = await a.uploads.create({
        accountId: account.id,
        fileName: "s.csv",
        fileHash: `share-${account.id}`,
      });
      const [txn] = await a.transactions.create({
        accountId: account.id,
        uploadId: upload.id,
        date: "2026-03-10",
        amount,
        merchant: "GROUP GIFT",
        rawCategory: "",
        sourceRow: 0,
        classificationStatus: "classified",
        expenseType: "Nice to have",
      });
      return { accountId: account.id, txn };
    }

    it("counts only the Own share in spend, not the full charge", async () => {
      const { a } = await twoHouseholds();
      const { txn } = await seedDebit(a, -200_000);

      // Before splitting, the full charge counts.
      expect((await a.transactions.monthlySpendSeries(range))[0].spending).toBe(200_000);

      const [shared] = await a.transactions.setOwnShare(txn.id, -28_571);
      expect(shared.ownShareAmount).toBe(-28_571);

      // Spend, the net-summary row, top-merchants, and largest-charge all follow the share.
      expect((await a.transactions.monthlySpendSeries(range))[0].spending).toBe(28_571);
      const [summaryRow] = await a.transactions.summaryRows(range);
      expect(summaryRow.amount).toBe(-28_571);
      expect((await a.transactions.topMerchants(range))[0].spending).toBe(28_571);
      expect((await a.transactions.largestCharge(range))?.amount).toBe(28_571);
    });

    it("clearing returns the row to its full charged amount", async () => {
      const { a } = await twoHouseholds();
      const { txn } = await seedDebit(a, -200_000);
      await a.transactions.setOwnShare(txn.id, -28_571);
      const [cleared] = await a.transactions.setOwnShare(txn.id, null);
      expect(cleared.ownShareAmount).toBeNull();
      expect((await a.transactions.monthlySpendSeries(range))[0].spending).toBe(200_000);
    });

    it("no-ops on a credit (debit-only, no CHECK trip)", async () => {
      const { a } = await twoHouseholds();
      const { txn } = await seedDebit(a, 5_000);
      expect(await a.transactions.setOwnShare(txn.id, -1_000)).toHaveLength(0);
    });

    it("no-ops when the share exceeds the charge magnitude", async () => {
      const { a } = await twoHouseholds();
      const { txn } = await seedDebit(a, -1_000);
      expect(await a.transactions.setOwnShare(txn.id, -2_000)).toHaveLength(0);
    });

    it("no-ops on an excluded row (mutually exclusive)", async () => {
      const { a } = await twoHouseholds();
      const { txn } = await seedDebit(a, -1_000);
      await a.transactions.setExcluded(txn.id, true);
      expect(await a.transactions.setOwnShare(txn.id, -500)).toHaveLength(0);
    });

    it("scopes the update to the bound household", async () => {
      const { a, b } = await twoHouseholds();
      const { txn } = await seedDebit(a, -1_000);
      expect(await b.transactions.setOwnShare(txn.id, -500)).toHaveLength(0);
    });
  });

  describe("transactions.progress", () => {
    /** Seed an upload in household `a` with `n` rows, then classify/fail some of them. */
    async function seedUpload(
      a: Awaited<ReturnType<typeof twoHouseholds>>["a"],
      counts: { classified: number; failed: number; pending: number },
    ) {
      const [account] = await a.accounts.create({ name: "Visa" });
      const [upload] = await a.uploads.create({
        accountId: account.id,
        fileName: "p.csv",
        fileHash: `hash-${counts.classified}-${counts.failed}-${counts.pending}`,
      });
      const total = counts.classified + counts.failed + counts.pending;
      const rows = await a.transactions.createMany(
        Array.from({ length: total }, (_, i) => ({
          accountId: account.id,
          uploadId: upload.id,
          date: "2026-03-01",
          amount: -1000 - i,
          merchant: `M${i}`,
          rawCategory: "",
          sourceRow: i,
        })),
      );
      for (let i = 0; i < counts.classified; i++) {
        await a.transactions.classify(rows[i].id, { expenseType: "Necessary" });
      }
      for (let i = counts.classified; i < counts.classified + counts.failed; i++) {
        await a.transactions.markFailed(rows[i].id);
      }
      return upload.id;
    }

    it("counts transactions by classification status for the upload", async () => {
      const { a } = await twoHouseholds();
      const uploadId = await seedUpload(a, { classified: 3, failed: 1, pending: 2 });
      expect(await a.transactions.progress(uploadId)).toEqual({
        total: 6,
        pending: 2,
        classified: 3,
        failed: 1,
      });
    });

    it("returns all-zero counts for an upload with no transactions", async () => {
      const { a } = await twoHouseholds();
      const [account] = await a.accounts.create({ name: "Empty" });
      const [upload] = await a.uploads.create({
        accountId: account.id,
        fileName: "empty.csv",
        fileHash: "empty",
      });
      expect(await a.transactions.progress(upload.id)).toEqual({
        total: 0,
        pending: 0,
        classified: 0,
        failed: 0,
      });
    });

    it("scopes progress to the upload and never counts another household's rows", async () => {
      const { a, b } = await twoHouseholds();
      const aUpload = await seedUpload(a, { classified: 1, failed: 0, pending: 1 });
      // B has its own upload; querying A's upload id through B's repo sees nothing.
      expect(await b.transactions.progress(aUpload)).toEqual({
        total: 0,
        pending: 0,
        classified: 0,
        failed: 0,
      });
    });
  });

  describe("transactions.resetFailed / countFailed / countPending", () => {
    /** Seed an upload in `repo` with the given per-status counts; returns the upload id. */
    async function seed(
      repo: Awaited<ReturnType<typeof twoHouseholds>>["a"],
      counts: { classified: number; failed: number; pending: number },
      tag: string,
    ) {
      const [account] = await repo.accounts.create({ name: "Visa" });
      const [upload] = await repo.uploads.create({
        accountId: account.id,
        fileName: `${tag}.csv`,
        fileHash: `hash-${tag}`,
      });
      const total = counts.classified + counts.failed + counts.pending;
      const rows = await repo.transactions.createMany(
        Array.from({ length: total }, (_, i) => ({
          accountId: account.id,
          uploadId: upload.id,
          date: "2026-03-01",
          amount: -1000 - i,
          merchant: `M${i}`,
          rawCategory: "",
          sourceRow: i,
        })),
      );
      for (let i = 0; i < counts.classified; i++) {
        await repo.transactions.classify(rows[i].id, { expenseType: "Necessary" });
      }
      for (let i = counts.classified; i < counts.classified + counts.failed; i++) {
        await repo.transactions.markFailed(rows[i].id);
      }
      return upload.id;
    }

    it("requeues only failed rows back to pending, leaving classified/pending untouched", async () => {
      const { a } = await twoHouseholds();
      const uploadId = await seed(a, { classified: 2, failed: 3, pending: 1 }, "reset");

      const reset = await a.transactions.resetFailed();
      expect(reset).toHaveLength(3);
      // The three failed rows are now pending; the two classified and one already-pending stay put.
      expect(await a.transactions.progress(uploadId)).toEqual({
        total: 6,
        pending: 4,
        classified: 2,
        failed: 0,
      });
    });

    it("requeues nothing when there are no failed rows", async () => {
      const { a } = await twoHouseholds();
      await seed(a, { classified: 1, failed: 0, pending: 1 }, "none");
      expect(await a.transactions.resetFailed()).toHaveLength(0);
    });

    it("counts pending rows, excluding overridden ones, scoped to the household", async () => {
      const { a, b } = await twoHouseholds();
      await seed(a, { classified: 1, failed: 1, pending: 3 }, "pend-a");
      await seed(b, { classified: 0, failed: 0, pending: 2 }, "pend-b");

      expect(await a.transactions.countPending()).toBe(3);
      expect(await b.transactions.countPending()).toBe(2);

      // An overridden pending row leaves the work queue (mirrors listPending), so the count drops.
      const [pendingRow] = await a.transactions.listPending(1);
      await a.overrides.upsert({ transactionId: pendingRow.id, expenseType: "Fixed" });
      expect(await a.transactions.countPending()).toBe(2);
    });

    it("counts failed rows and never touches or counts another household's", async () => {
      const { a, b } = await twoHouseholds();
      await seed(a, { classified: 1, failed: 2, pending: 0 }, "a");
      const bUpload = await seed(b, { classified: 0, failed: 2, pending: 0 }, "b");

      expect(await a.transactions.countFailed()).toBe(2);
      // A's reset must not requeue B's failures.
      await a.transactions.resetFailed();
      expect(await b.transactions.countFailed()).toBe(2);
      expect(await b.transactions.progress(bUpload)).toMatchObject({ failed: 2, pending: 0 });
    });
  });

  describe("transactions.retypeByMerchantRules", () => {
    /** Seed one upload and a per-transaction adder for `repo`. */
    async function seed(repo: Awaited<ReturnType<typeof twoHouseholds>>["a"], tag: string) {
      const [account] = await repo.accounts.create({ name: "Visa" });
      const [upload] = await repo.uploads.create({
        accountId: account.id,
        fileName: `${tag}.csv`,
        fileHash: `hash-${tag}`,
      });
      let n = 0;
      const addTxn = (merchant: string, amount: number) =>
        repo.transactions.create({
          accountId: account.id,
          uploadId: upload.id,
          date: "2026-03-01",
          amount,
          merchant,
          rawCategory: "",
          sourceRow: n++,
        });
      return { addTxn };
    }

    it("re-types matching pending, classified, and failed rows deterministically", async () => {
      const { a } = await twoHouseholds();
      const { addTxn } = await seed(a, "retype");
      const [pending] = await addTxn("NETFLIX", -1990);
      const [classified] = await addTxn("NETFLIX", -1990);
      await a.transactions.classify(classified.id, { expenseType: "Necessary", confidence: 0.6 });
      const [failed] = await addTxn("NETFLIX", -1990);
      await a.transactions.markFailed(failed.id);
      const [unmatched] = await addTxn("OBSCURE SHOP", -500);

      await a.merchantRules.create({ merchant: "NETFLIX", flatType: "Fixed" });
      const retyped = await a.transactions.retypeByMerchantRules();

      expect(retyped).toBe(3);
      for (const id of [pending.id, classified.id, failed.id]) {
        const row = await a.transactions.findById(id);
        expect(row?.classificationStatus).toBe("classified");
        expect(row?.expenseType).toBe("Fixed");
        expect(row?.confidence).toBe(1);
        expect(row?.reasoning).toBe("merchant rule");
      }
      // The unmatched row is left alone.
      expect((await a.transactions.findById(unmatched.id))?.classificationStatus).toBe("pending");
    });

    it("skips overridden rows and honours split thresholds", async () => {
      const { a } = await twoHouseholds();
      const { addTxn } = await seed(a, "split");
      const [overridden] = await addTxn("WORLD CLASS", -12000);
      await a.overrides.upsert({ transactionId: overridden.id, expenseType: "Necessary" });
      const [membership] = await addTxn("WORLD CLASS", -12000);
      const [dropin] = await addTxn("WORLD CLASS", -1500);

      await a.merchantRules.create({
        merchant: "WORLD CLASS",
        threshold: 8000,
        atOrAboveType: "Fixed",
        belowType: "Nice to have",
      });
      const retyped = await a.transactions.retypeByMerchantRules();

      expect(retyped).toBe(2); // overridden row not counted
      expect((await a.transactions.findById(membership.id))?.expenseType).toBe("Fixed");
      expect((await a.transactions.findById(dropin.id))?.expenseType).toBe("Nice to have");
      // Overridden row keeps its pending status and no baked-in type (override wins on read).
      expect((await a.transactions.findById(overridden.id))?.classificationStatus).toBe("pending");
    });

    it("is a no-op when the household has no rules, and is household-scoped", async () => {
      const { a, b } = await twoHouseholds();
      const { addTxn } = await seed(a, "noop-a");
      await addTxn("NETFLIX", -1990);
      // No rules yet.
      expect(await a.transactions.retypeByMerchantRules()).toBe(0);

      // B's rule must not re-type A's rows.
      await b.merchantRules.create({ merchant: "NETFLIX", flatType: "Fixed" });
      expect(await a.transactions.retypeByMerchantRules()).toBe(0);
      expect((await a.transactions.listPending())[0].merchant).toBe("NETFLIX");
    });

    it("createAndApply inserts the rule and re-types matching rows in one transaction", async () => {
      const { a } = await twoHouseholds();
      const { addTxn } = await seed(a, "atomic");
      const [pending] = await addTxn("NETFLIX", -1990);
      await addTxn("OBSCURE SHOP", -500);

      const { rule, retyped } = await a.merchantRules.createAndApply({
        merchant: "NETFLIX",
        flatType: "Fixed",
      });

      expect(rule.merchant).toBe("NETFLIX");
      expect(retyped).toBe(1); // the just-created rule is visible to the re-type in the same tx
      expect((await a.transactions.findById(pending.id))?.expenseType).toBe("Fixed");
    });

    it("applies a rule's Category to matching rows; a type-only rule leaves an existing one (ADR-0020)", async () => {
      const { a, aId } = await twoHouseholds();
      await seedCategoriesForHousehold(asRepoDb(db), aId);
      const groceriesId = (await a.categories.leafSlugToId()).get("groceries")!;
      const { addTxn } = await seed(a, "cat");

      const [ruled] = await addTxn("BONUS", -4200);
      await a.merchantRules.createAndApply({
        merchant: "BONUS",
        flatType: "Necessary",
        categoryId: groceriesId,
      });
      const afterRuled = await a.transactions.findById(ruled.id);
      expect(afterRuled?.categoryId).toBe(groceriesId);
      expect(afterRuled?.categoryConfidence).toBe(1);

      // A type-only rule must re-type but NOT wipe a Category already set by Classification.
      const [classified] = await addTxn("KAFFI", -800);
      await a.transactions.classify(classified.id, {
        expenseType: "Nice to have",
        confidence: 0.9,
        categoryId: groceriesId,
        categoryConfidence: 0.8,
      });
      await a.merchantRules.createAndApply({ merchant: "KAFFI", flatType: "Fixed" });
      const afterClassified = await a.transactions.findById(classified.id);
      expect(afterClassified?.expenseType).toBe("Fixed"); // re-typed
      expect(afterClassified?.categoryId).toBe(groceriesId); // Category preserved
    });

    it("does not apply a rule's hidden Category on re-type (ADR-0020 parity)", async () => {
      const { a, aId } = await twoHouseholds();
      await seedCategoriesForHousehold(asRepoDb(db), aId);
      const groceriesId = (await a.categories.leafSlugToId()).get("groceries")!;
      await db
        .update(categories)
        .set({ hidden: true })
        .where(and(eq(categories.householdId, aId), eq(categories.slug, "groceries")));
      const { addTxn } = await seed(a, "hidden");
      const [row] = await addTxn("BONUS", -4200);

      await a.merchantRules.createAndApply({
        merchant: "BONUS",
        flatType: "Necessary",
        categoryId: groceriesId,
      });
      const after = await a.transactions.findById(row.id);
      expect(after?.expenseType).toBe("Necessary"); // type still applied
      expect(after?.categoryId).toBeNull(); // hidden Category not applied
    });
  });

  describe("transactions.reuseTallies", () => {
    it("tallies only confident genuine model classifications, excluding derived + low-confidence rows", async () => {
      const { a } = await twoHouseholds();
      const [account] = await a.accounts.create({ name: "Visa" });
      const [upload] = await a.uploads.create({
        accountId: account.id,
        fileName: "reuse.csv",
        fileHash: "reuse",
      });
      const row = (
        merchant: string,
        expenseType: "Fixed" | "Necessary" | "Nice to have" | "",
        confidence: number | null,
        reasoning: string | null,
        sourceRow: number,
      ) => ({
        accountId: account.id,
        uploadId: upload.id,
        date: "2026-03-01",
        amount: -1000 - sourceRow,
        merchant,
        rawCategory: "x",
        sourceRow,
        classificationStatus: "classified" as const,
        expenseType,
        confidence,
        reasoning,
      });
      await a.transactions.createMany([
        row("NETFLIX", "Fixed", 0.98, "model reasoning", 0), // counts
        row("NETFLIX", "Fixed", 0.85, null, 1), // counts (null reasoning = genuine older row)
        row("NETFLIX", "Necessary", 0.5, "model reasoning", 2), // excluded: below floor
        row("BONUS", "Necessary", 1, "merchant rule", 3), // excluded: derived (rule)
        row("BONUS", "Necessary", 0.9, "reused (merchant history)", 4), // excluded: derived (reuse)
      ]);

      const tallies = await a.transactions.reuseTallies(0.7);
      const netflix = tallies.filter((t) => t.merchant === "NETFLIX");
      expect(netflix).toEqual([
        { merchant: "NETFLIX", expenseType: "Fixed", n: 2, maxConfidence: 0.98 },
      ]);
      // BONUS had only derived-reason rows, so it contributes nothing to the tally.
      expect(tallies.some((t) => t.merchant === "BONUS")).toBe(false);
    });
  });

  describe("bankConnections", () => {
    const conn = (providerConnectionId: string) => ({
      provider: "enable_banking",
      providerConnectionId,
    });

    it("stamps the household and defaults to active on create", async () => {
      const { a, aId } = await twoHouseholds();
      const [c] = await a.bankConnections.create(conn("c1"));
      expect(c.householdId).toBe(aId);
      expect(c.status).toBe("active");
    });

    it("scopes list and findById to the bound household", async () => {
      const { a, b } = await twoHouseholds();
      const [ca] = await a.bankConnections.create(conn("a"));
      await b.bankConnections.create(conn("b"));

      expect(await a.bankConnections.list()).toHaveLength(1);
      expect((await a.bankConnections.findById(ca.id))?.providerConnectionId).toBe("a");
      // Another household's connection id is invisible.
      expect(await b.bankConnections.findById(ca.id)).toBeUndefined();
    });

    it("updates mutable lifecycle fields, scoped to the household", async () => {
      const { a, b } = await twoHouseholds();
      const [ca] = await a.bankConnections.create(conn("upd"));
      const [updated] = await a.bankConnections.update(ca.id, {
        status: "expired",
        institutionName: "Landsbankinn",
      });
      expect(updated.status).toBe("expired");
      expect(updated.institutionName).toBe("Landsbankinn");
      // B cannot touch A's connection.
      expect(await b.bankConnections.update(ca.id, { status: "revoked" })).toHaveLength(0);
    });
  });
});
