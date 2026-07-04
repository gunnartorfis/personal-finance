import { PGlite } from "@electric-sql/pglite";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { seedCategoriesForHousehold } from "@/lib/categories/seed-household";

import { accounts, categories, households, transactions, uploads } from "./schema";

// Exercise the real committed migrations against in-memory Postgres so the transactions.category_id
// composite tenant FK + category_confidence CHECK (ADR-0020) are verified without a live Neon DB.
function freshDb() {
  return drizzle(new PGlite(), {
    schema: { households, accounts, uploads, transactions, categories },
  });
}

let db: ReturnType<typeof freshDb>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof seedCategoriesForHousehold>[0];

beforeAll(async () => {
  db = freshDb();
  await migrate(db, { migrationsFolder: "./drizzle" });
});

/** A household (with its seeded Category taxonomy) + account + upload to hang transactions off. */
async function scaffold() {
  const [household] = await db.insert(households).values({}).returning();
  await seedCategoriesForHousehold(asDb(db), household.id);
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
      fileHash: `hash-${household.id}`,
    })
    .returning();
  return { householdId: household.id, accountId: account.id, uploadId: upload.id };
}

async function aLeafCategoryId(householdId: string) {
  const [leaf] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.householdId, householdId), isNotNull(categories.parentId)))
    .limit(1);
  return leaf.id;
}

async function aGroupCategoryId(householdId: string) {
  const [group] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.householdId, householdId), isNull(categories.parentId)))
    .limit(1);
  return group.id;
}

function insertTxn(
  base: { householdId: string; accountId: string; uploadId: string },
  values: { categoryId?: string | null; categoryConfidence?: number | null },
) {
  return db
    .insert(transactions)
    .values({
      householdId: base.householdId,
      accountId: base.accountId,
      uploadId: base.uploadId,
      source: "csv",
      date: "2026-03-01",
      merchant: "BONUS",
      rawCategory: "x",
      sourceRow: 0,
      amount: -1000,
      ...values,
    })
    .returning();
}

describe("transactions.category_id (ADR-0020) schema", () => {
  it("defaults to Uncategorized (null category)", async () => {
    const base = await scaffold();
    const [txn] = await insertTxn(base, {});
    expect(txn.categoryId).toBeNull();
    expect(txn.categoryConfidence).toBeNull();
  });

  it("accepts a leaf Category from the same household", async () => {
    const base = await scaffold();
    const leafId = await aLeafCategoryId(base.householdId);
    const [txn] = await insertTxn(base, { categoryId: leafId, categoryConfidence: 0.9 });
    expect(txn.categoryId).toBe(leafId);
    expect(txn.categoryConfidence).toBeCloseTo(0.9);
  });

  it("rejects a Category belonging to another household (composite tenant FK)", async () => {
    const base = await scaffold();
    const other = await scaffold();
    const foreignLeaf = await aLeafCategoryId(other.householdId);
    await expect(insertTxn(base, { categoryId: foreignLeaf })).rejects.toThrow();
  });

  it("rejects category_confidence without a Category", async () => {
    const base = await scaffold();
    await expect(insertTxn(base, { categoryConfidence: 0.5 })).rejects.toThrow();
  });

  it("rejects category_confidence outside [0, 1]", async () => {
    const base = await scaffold();
    const leafId = await aLeafCategoryId(base.householdId);
    await expect(
      insertTxn(base, { categoryId: leafId, categoryConfidence: 1.5 }),
    ).rejects.toThrow();
  });

  it("permits a group-level Category at the DB (leaf-only is an app-layer invariant)", async () => {
    // A CHECK can't assert the referenced row is a leaf (it depends on that row's parent_id, a
    // cross-row read Postgres forbids). The FK accepts any same-Household category; leaf-only is
    // enforced where categories are assigned (worker / merchant rule / override, S2c/S3).
    const base = await scaffold();
    const groupId = await aGroupCategoryId(base.householdId);
    const [txn] = await insertTxn(base, { categoryId: groupId });
    expect(txn.categoryId).toBe(groupId);
  });
});
