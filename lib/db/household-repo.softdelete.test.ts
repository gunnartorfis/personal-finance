import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

/**
 * A Member soft-deletes a single Transaction (own column `deletedAt`, distinct from the
 * upload-derived `archived`). Like `archived` it is RETAINED (append-only) but HIDDEN from the
 * transactions list and every calculation, reversible via restore. Unlike `archived` it is a
 * per-row Member action, scoped to non-`bank_sync` rows (a re-Sync would re-add a bank row).
 * It STILL counts toward the Free cap and is STILL visible to the raw export read and the
 * fingerprint dedup (so a re-upload never silently resurrects it). These tests pin that
 * behavior through the repo's public methods.
 */
describe("transactions soft-delete (deletedAt)", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
  // March window used by the range-scoped reads; contains only the active/to-delete pair.
  const MARCH = { from: "2026-03-01", to: "2026-04-01" };

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  async function freshHousehold() {
    const [h] = await db.insert(households).values({}).returning();
    return householdRepo(asRepoDb(db), h.id);
  }

  /**
   * Seed one household with:
   *  - Main / March: two classified debits, ACTIVE and TODELETE (identical but for merchant),
   *  - a single pending debit (countPending),
   *  - a bank_sync debit (the delete guard must refuse it),
   *  - a SOLO account + unique month whose only row is deleted in the vanishing-reads tests.
   */
  async function seed() {
    const repo = await freshHousehold();
    const [main] = await repo.accounts.create({ name: "Main" });
    const [pendingAcct] = await repo.accounts.create({ name: "Pending" });
    const [solo] = await repo.accounts.create({ name: "Solo" });
    const [up] = await repo.uploads.create({
      accountId: main.id,
      fileName: "a.csv",
      fileHash: "softdel",
    });
    const csv = { uploadId: up.id, rawCategory: "" };
    const rows = await repo.transactions.createMany([
      {
        ...csv,
        accountId: main.id,
        date: "2026-03-15",
        amount: -1000,
        merchant: "ACTIVE",
        sourceRow: 0,
        classificationStatus: "classified",
        expenseType: "Necessary",
        confidence: 0.4,
      },
      {
        ...csv,
        accountId: main.id,
        date: "2026-03-16",
        amount: -1000,
        merchant: "TODELETE",
        sourceRow: 1,
        classificationStatus: "classified",
        expenseType: "Necessary",
        confidence: 0.4,
      },
      {
        ...csv,
        accountId: pendingAcct.id,
        date: "2026-06-10",
        amount: -3000,
        merchant: "PEND",
        sourceRow: 2,
        classificationStatus: "pending",
      },
      {
        ...csv,
        accountId: solo.id,
        date: "2026-08-10",
        amount: -500,
        merchant: "SOLO",
        sourceRow: 3,
        classificationStatus: "classified",
        expenseType: "Necessary",
        confidence: 0.4,
      },
    ]);
    // A bank_sync row carries an externalId and no uploadId/sourceRow (provenance CHECK).
    const [bankSync] = await repo.transactions.createMany([
      {
        accountId: main.id,
        source: "bank_sync",
        externalId: "ext-1",
        rawCategory: "",
        date: "2026-05-10",
        amount: -2000,
        merchant: "BANKSYNC",
        classificationStatus: "classified",
        expenseType: "Necessary",
        confidence: 0.4,
      },
    ]);
    return {
      repo,
      main,
      pendingAcct,
      solo,
      active: rows[0],
      toDelete: rows[1],
      pending: rows[2],
      soloRow: rows[3],
      bankSync,
    };
  }

  it("softDelete hides the row from listWithOverrides, keeps the active one", async () => {
    const { repo, toDelete } = await seed();
    await repo.transactions.softDelete(toDelete.id);
    const rows = await repo.transactions.listWithOverrides(MARCH);
    expect(rows.map((r) => r.merchant)).toEqual(["ACTIVE"]);
  });

  it("softDelete drops the row from summaryRows", async () => {
    const { repo, toDelete } = await seed();
    await repo.transactions.softDelete(toDelete.id);
    const rows = await repo.transactions.summaryRows(MARCH);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-1000);
  });

  it("softDelete excludes the row from monthlySpendSeries", async () => {
    const { repo, toDelete } = await seed();
    await repo.transactions.softDelete(toDelete.id);
    expect(await repo.transactions.monthlySpendSeries(MARCH)).toEqual([
      { month: "2026-03", spending: 1000, income: 0 },
    ]);
  });

  it("softDelete excludes the row from topMerchants", async () => {
    const { repo, toDelete } = await seed();
    await repo.transactions.softDelete(toDelete.id);
    expect(await repo.transactions.topMerchants(MARCH)).toEqual([
      { merchant: "ACTIVE", spending: 1000 },
    ]);
  });

  it("softDelete omits the row from spendByAccount", async () => {
    const { repo, main, toDelete } = await seed();
    await repo.transactions.softDelete(toDelete.id);
    expect(await repo.transactions.spendByAccount(MARCH)).toEqual([
      { accountId: main.id, name: "Main", spending: 1000 },
    ]);
  });

  it("softDelete omits the row from netByAccount", async () => {
    const { repo, main, toDelete } = await seed();
    await repo.transactions.softDelete(toDelete.id);
    expect(await repo.transactions.netByAccount(MARCH)).toEqual([
      { accountId: main.id, name: "Main", net: -1000 },
    ]);
  });

  it("reviewQueue never surfaces a soft-deleted row", async () => {
    const { repo, active, toDelete } = await seed();
    await repo.transactions.softDelete(toDelete.id);
    const ids = (await repo.transactions.reviewQueue()).map((r) => r.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(toDelete.id);
  });

  it("countPending ignores a soft-deleted pending row", async () => {
    const { repo, pending } = await seed();
    expect(await repo.transactions.countPending()).toBe(1);
    await repo.transactions.softDelete(pending.id);
    expect(await repo.transactions.countPending()).toBe(0);
  });

  it("cycleMonths omits a month whose only row is soft-deleted", async () => {
    const { repo, soloRow } = await seed();
    await repo.transactions.softDelete(soloRow.id);
    const months = await repo.transactions.cycleMonths();
    expect(months).toContain("2026-03");
    expect(months).not.toContain("2026-08");
  });

  it("accountIdsWithTransactions omits an account whose only row is soft-deleted", async () => {
    const { repo, main, solo, soloRow } = await seed();
    await repo.transactions.softDelete(soloRow.id);
    const ids = await repo.transactions.accountIdsWithTransactions();
    expect(ids).toContain(main.id);
    expect(ids).not.toContain(solo.id);
  });

  it("countClassified still counts a soft-deleted row (Free cap unaffected)", async () => {
    const { repo, toDelete } = await seed();
    // active + toDelete + solo + bankSync are all classified.
    expect(await repo.transactions.countClassified()).toBe(4);
    await repo.transactions.softDelete(toDelete.id);
    expect(await repo.transactions.countClassified()).toBe(4);
  });

  it("listByAccount still returns a soft-deleted row (dedup sees it, no resurrection)", async () => {
    const { repo, main, toDelete } = await seed();
    await repo.transactions.softDelete(toDelete.id);
    const ids = (await repo.transactions.listByAccount(main.id)).map((r) => r.id);
    expect(ids).toContain(toDelete.id);
  });

  it("raw list() still returns a soft-deleted row (retained, append-only)", async () => {
    const { repo, toDelete } = await seed();
    await repo.transactions.softDelete(toDelete.id);
    const ids = (await repo.transactions.list()).map((r) => r.id);
    expect(ids).toContain(toDelete.id);
    expect(await repo.transactions.list()).toHaveLength(5);
  });

  it("listDeleted returns the soft-deleted row within the range", async () => {
    const { repo, toDelete } = await seed();
    await repo.transactions.softDelete(toDelete.id);
    const deleted = await repo.transactions.listDeleted(MARCH);
    expect(deleted.map((r) => r.merchant)).toEqual(["TODELETE"]);
    expect(deleted[0].id).toBe(toDelete.id);
  });

  it("restoreDeleted returns the row to the list and empties listDeleted", async () => {
    const { repo, toDelete } = await seed();
    await repo.transactions.softDelete(toDelete.id);
    await repo.transactions.restoreDeleted(toDelete.id);
    const rows = await repo.transactions.listWithOverrides(MARCH);
    expect(rows.map((r) => r.merchant).sort()).toEqual(["ACTIVE", "TODELETE"]);
    expect(await repo.transactions.listDeleted(MARCH)).toHaveLength(0);
  });

  it("softDelete refuses a bank_sync row (no-op)", async () => {
    const { repo, main, bankSync } = await seed();
    const updated = await repo.transactions.softDelete(bankSync.id);
    expect(updated).toHaveLength(0);
    const ids = (await repo.transactions.listByAccount(main.id)).map((r) => r.id);
    expect(ids).toContain(bankSync.id);
  });

  it("softDelete on an already-deleted row is a no-op", async () => {
    const { repo, toDelete } = await seed();
    expect(await repo.transactions.softDelete(toDelete.id)).toHaveLength(1);
    expect(await repo.transactions.softDelete(toDelete.id)).toHaveLength(0);
  });

  it("softDelete ignores a foreign household's transaction id", async () => {
    const { toDelete } = await seed();
    const other = await freshHousehold();
    expect(await other.transactions.softDelete(toDelete.id)).toHaveLength(0);
  });

  it("drops a soft-deleted pending row from upload progress, so the upload can complete", async () => {
    const { repo, pending } = await seed();
    // The upload's rows: 3 classified + 1 pending. Before delete, progress still awaits the pending one.
    const before = await repo.transactions.progress(pending.uploadId!);
    expect(before).toMatchObject({ total: 4, pending: 1, classified: 3 });
    // Deleting the pending row must remove it from BOTH pending and total, else the progress poller
    // waits forever for classification work that can never happen (listPending already skips it).
    await repo.transactions.softDelete(pending.id);
    expect(await repo.transactions.progress(pending.uploadId!)).toMatchObject({
      total: 3,
      pending: 0,
      classified: 3,
    });
  });

  it("restoreDeleted only affects an actually-deleted row (idempotent, no double-restore)", async () => {
    const { repo, active, toDelete } = await seed();
    // A live row is a no-op (guards the route against a duplicate 'restored' audit entry on races).
    expect(await repo.transactions.restoreDeleted(active.id)).toHaveLength(0);
    await repo.transactions.softDelete(toDelete.id);
    // The first restore of a deleted row wins; a second is a no-op.
    expect(await repo.transactions.restoreDeleted(toDelete.id)).toHaveLength(1);
    expect(await repo.transactions.restoreDeleted(toDelete.id)).toHaveLength(0);
  });

  it("softDelete unlinks a transfer pair so the surviving leg returns to spend math", async () => {
    const repo = await freshHousehold();
    const [main] = await repo.accounts.create({ name: "Main" });
    const [savings] = await repo.accounts.create({ name: "Savings" });
    const [up] = await repo.uploads.create({
      accountId: main.id,
      fileName: "x.csv",
      fileHash: "xfer",
    });
    const base = { uploadId: up.id, rawCategory: "", classificationStatus: "classified" as const, expenseType: "" };
    const [legOut, legIn] = await repo.transactions.createMany([
      { ...base, accountId: main.id, date: "2026-03-20", amount: -5000, merchant: "XFER-OUT", sourceRow: 0 },
      { ...base, accountId: savings.id, date: "2026-03-20", amount: 5000, merchant: "XFER-IN", sourceRow: 1 },
    ]);
    await repo.transactions.markTransferPair(legOut.id, legIn.id);
    // While paired, both legs are money movement — excluded from spend, so March shows no spend.
    expect(await repo.transactions.monthlySpendSeries(MARCH)).toEqual([]);
    // Deleting the money-in leg must unlink the pair, freeing the surviving debit to count as spend.
    await repo.transactions.softDelete(legIn.id);
    const survivor = (await repo.transactions.listWithOverrides(MARCH)).find(
      (r) => r.merchant === "XFER-OUT",
    );
    expect(survivor?.transferGroupId).toBeNull();
    expect(await repo.transactions.monthlySpendSeries(MARCH)).toEqual([
      { month: "2026-03", spending: 5000, income: 0 },
    ]);
  });
});
