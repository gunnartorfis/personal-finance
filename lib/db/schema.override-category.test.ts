import { PGlite } from "@electric-sql/pglite";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { seedCategoriesForHousehold } from "@/lib/categories/seed-household";

import { accounts, categories, households, overrides, transactions, uploads } from "./schema";

// Verify the override Category column + CHECKs (ADR-0020, S3b) against real migrations, no live DB.
function freshDb() {
  return drizzle(new PGlite(), {
    schema: { households, accounts, uploads, transactions, overrides, categories },
  });
}

let db: ReturnType<typeof freshDb>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof seedCategoriesForHousehold>[0];

beforeAll(async () => {
  db = freshDb();
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function scaffold() {
  const [household] = await db.insert(households).values({}).returning();
  await seedCategoriesForHousehold(asDb(db), household.id);
  const [account] = await db
    .insert(accounts)
    .values({ householdId: household.id, name: "Visa" })
    .returning();
  const [upload] = await db
    .insert(uploads)
    .values({ householdId: household.id, accountId: account.id, fileName: "m.csv", fileHash: `h-${household.id}` })
    .returning();
  return { householdId: household.id, accountId: account.id, uploadId: upload.id };
}

let row = 0;
async function aTxn(base: { householdId: string; accountId: string; uploadId: string }) {
  const [txn] = await db
    .insert(transactions)
    .values({
      householdId: base.householdId,
      accountId: base.accountId,
      uploadId: base.uploadId,
      source: "csv",
      date: "2026-03-01",
      merchant: "BONUS",
      rawCategory: "x",
      sourceRow: row++,
      amount: -1000,
    })
    .returning();
  return txn.id;
}

async function aLeafId(householdId: string) {
  const [leaf] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.householdId, householdId), isNotNull(categories.parentId)))
    .limit(1);
  return leaf.id;
}

describe("overrides Category axis (ADR-0020) schema", () => {
  it("accepts a type-only override (Category null)", async () => {
    const base = await scaffold();
    const [ov] = await db
      .insert(overrides)
      .values({ householdId: base.householdId, transactionId: await aTxn(base), expenseType: "Fixed" })
      .returning();
    expect(ov.expenseType).toBe("Fixed");
    expect(ov.categoryId).toBeNull();
  });

  it("accepts a category-only override (Expense type null)", async () => {
    const base = await scaffold();
    const leafId = await aLeafId(base.householdId);
    const [ov] = await db
      .insert(overrides)
      .values({ householdId: base.householdId, transactionId: await aTxn(base), categoryId: leafId })
      .returning();
    expect(ov.expenseType).toBeNull();
    expect(ov.categoryId).toBe(leafId);
  });

  it("accepts an override that sets both axes", async () => {
    const base = await scaffold();
    const leafId = await aLeafId(base.householdId);
    const [ov] = await db
      .insert(overrides)
      .values({
        householdId: base.householdId,
        transactionId: await aTxn(base),
        expenseType: "Necessary",
        categoryId: leafId,
      })
      .returning();
    expect(ov.expenseType).toBe("Necessary");
    expect(ov.categoryId).toBe(leafId);
  });

  it("rejects an override that sets neither axis", async () => {
    const base = await scaffold();
    const txnId = await aTxn(base);
    await expect(
      db.insert(overrides).values({ householdId: base.householdId, transactionId: txnId }),
    ).rejects.toThrow();
  });

  it("rejects a Category from another household (composite tenant FK)", async () => {
    const base = await scaffold();
    const other = await scaffold();
    const foreignLeaf = await aLeafId(other.householdId);
    await expect(
      db.insert(overrides).values({
        householdId: base.householdId,
        transactionId: await aTxn(base),
        categoryId: foreignLeaf,
      }),
    ).rejects.toThrow();
  });
});
