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

  it("findById returns a row in the household but not one from another", async () => {
    const { a, b } = await twoHouseholds();
    const [account] = await a.accounts.create({ name: "Visa" });
    expect((await a.accounts.findById(account.id))?.name).toBe("Visa");
    // B cannot read A's account by id — scoping returns undefined, not the row.
    expect(await b.accounts.findById(account.id)).toBeUndefined();
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
});
