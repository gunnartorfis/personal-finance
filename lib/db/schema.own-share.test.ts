import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { accounts, households, transactions, uploads } from "./schema";

// Exercise the real committed migrations against an in-memory Postgres so the Own share
// generated column and its CHECK constraints (ADR-0014) are verified in CI without a live Neon DB.
function freshDb() {
  return drizzle(new PGlite(), {
    schema: { households, accounts, uploads, transactions },
  });
}

let db: ReturnType<typeof freshDb>;

beforeAll(async () => {
  db = freshDb();
  await migrate(db, { migrationsFolder: "./drizzle" });
});

/** A household + account + upload to hang debits off; every debit shares this provenance. */
async function scaffold() {
  const [household] = await db.insert(households).values({}).returning();
  const [account] = await db
    .insert(accounts)
    .values({ householdId: household.id, name: "Visa" })
    .returning();
  const [upload] = await db
    .insert(uploads)
    .values({
      householdId: household.id,
      accountId: account.id,
      fileName: "mar.csv",
      // fileHash is unique per household; vary it per scaffold so parallel rows don't collide.
      fileHash: `hash-${household.id}`,
    })
    .returning();
  return { householdId: household.id, accountId: account.id, uploadId: upload.id };
}

/** Insert a CSV transaction (satisfying the source-provenance CHECK) and return it. */
async function insertTxn(
  base: { householdId: string; accountId: string; uploadId: string },
  values: { amount: number; excluded?: boolean; ownShareAmount?: number | null }
) {
  const [row] = await db
    .insert(transactions)
    .values({
      householdId: base.householdId,
      accountId: base.accountId,
      uploadId: base.uploadId,
      source: "csv",
      date: "2026-03-01",
      merchant: "GROUP GIFT",
      rawCategory: "x",
      sourceRow: 0,
      ...values,
    })
    .returning();
  return row;
}

describe("Own share (ADR-0014) schema", () => {
  it("defaults effective_amount to the charge, and follows the Own share when set", async () => {
    const base = await scaffold();
    const txn = await insertTxn(base, { amount: -200_000 });
    expect(txn.ownShareAmount).toBeNull();
    expect(txn.effectiveAmount).toBe(-200_000);

    const [updated] = await db
      .update(transactions)
      .set({ ownShareAmount: -28_571 })
      .where(eq(transactions.id, txn.id))
      .returning();
    expect(updated.effectiveAmount).toBe(-28_571);

    const [cleared] = await db
      .update(transactions)
      .set({ ownShareAmount: null })
      .where(eq(transactions.id, txn.id))
      .returning();
    expect(cleared.effectiveAmount).toBe(-200_000);
  });

  it("rejects an Own share on a credit (debit-only)", async () => {
    const base = await scaffold();
    const credit = await insertTxn(base, { amount: 5_000 });
    await expect(
      db
        .update(transactions)
        .set({ ownShareAmount: -1_000 })
        .where(eq(transactions.id, credit.id))
    ).rejects.toThrow();
  });

  it("rejects a non-negative Own share (a zero share is Excluded instead)", async () => {
    const base = await scaffold();
    const txn = await insertTxn(base, { amount: -1_000 });
    await expect(
      db
        .update(transactions)
        .set({ ownShareAmount: 0 })
        .where(eq(transactions.id, txn.id))
    ).rejects.toThrow();
  });

  it("rejects an Own share larger in magnitude than the charge", async () => {
    const base = await scaffold();
    const txn = await insertTxn(base, { amount: -1_000 });
    await expect(
      db
        .update(transactions)
        .set({ ownShareAmount: -2_000 })
        .where(eq(transactions.id, txn.id))
    ).rejects.toThrow();
  });

  it("accepts an Own share equal to the charge (a UI-prevented no-op, but in bounds)", async () => {
    const base = await scaffold();
    const txn = await insertTxn(base, { amount: -1_000 });
    const [updated] = await db
      .update(transactions)
      .set({ ownShareAmount: -1_000 })
      .where(eq(transactions.id, txn.id))
      .returning();
    expect(updated.effectiveAmount).toBe(-1_000);
  });

  it("rejects an Own share on an excluded row (mutually exclusive)", async () => {
    const base = await scaffold();
    const txn = await insertTxn(base, { amount: -1_000, excluded: true });
    await expect(
      db
        .update(transactions)
        .set({ ownShareAmount: -500 })
        .where(eq(transactions.id, txn.id))
    ).rejects.toThrow();
  });

  it("rejects excluding a row that already carries an Own share", async () => {
    const base = await scaffold();
    const txn = await insertTxn(base, { amount: -1_000, ownShareAmount: -500 });
    await expect(
      db
        .update(transactions)
        .set({ excluded: true })
        .where(eq(transactions.id, txn.id))
    ).rejects.toThrow();
  });
});
