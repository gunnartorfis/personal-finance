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

    it("excludes an expense once it is overridden", async () => {
      const { a } = await twoHouseholds();
      const txn = await seedExpense(a, { date: "2026-03-15", sourceRow: 0 });
      expect(await a.transactions.reviewQueueMonths()).toEqual([{ month: "2026-03", count: 1 }]);
      await a.overrides.upsert({ transactionId: txn.id, expenseType: "Fixed" });
      expect(await a.transactions.reviewQueueMonths()).toEqual([]);
      expect(await a.transactions.reviewQueue()).toHaveLength(0);
    });
  });

  it("findById returns a row in the household but not one from another", async () => {
    const { a, b } = await twoHouseholds();
    const [account] = await a.accounts.create({ name: "Visa" });
    expect((await a.accounts.findById(account.id))?.name).toBe("Visa");
    // B cannot read A's account by id — scoping returns undefined, not the row.
    expect(await b.accounts.findById(account.id)).toBeUndefined();
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

  describe("transactions.resetFailed / countFailed", () => {
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
});
