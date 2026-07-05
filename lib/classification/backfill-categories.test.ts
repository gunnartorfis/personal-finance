import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households, transactions } from "@/lib/db/schema";

import { backfillCategories } from "./backfill-categories";
import type { Classifier } from "./worker";

let db: ReturnType<typeof drizzle>;
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

/** A category classifier keyed by merchant: Bonus→groceries, N1→fuel, else abstain (""). */
const byMerchant: Classifier = async (txn) => ({
  expenseType: "Necessary",
  category: txn.merchant === "Bonus" ? "groceries" : txn.merchant === "N1" ? "fuel" : "",
  categoryConfidence: 0.9,
});

async function seedHousehold(seedCategories: boolean, authUserId: string) {
  const [hh] = await db.insert(households).values({}).returning();
  const repo = householdRepo(asRepoDb(db), hh.id);
  if (seedCategories) await repo.categories.ensureSeeded();
  const [acct] = await repo.accounts.create({ name: "Visa" });
  const [up] = await repo.uploads.create({ accountId: acct.id, fileName: "b.csv", fileHash: authUserId });
  return { hh, repo, acct, up };
}

/** Create classified expense rows with NO category (the backfill candidates). */
async function addClassifiedNoCategory(
  repo: Awaited<ReturnType<typeof seedHousehold>>["repo"],
  acct: { id: string },
  up: { id: string },
  merchants: string[],
) {
  const created = await repo.transactions.createMany(
    merchants.map((m, i) => ({
      accountId: acct.id,
      uploadId: up.id,
      date: "2026-03-10",
      amount: -1000,
      merchant: m,
      rawCategory: "",
      sourceRow: i,
    })),
  );
  for (const row of created) await repo.transactions.classify(row.id, { expenseType: "Necessary" });
  return created;
}

describe("backfillCategories (ADR-0020, S7)", () => {
  it("fills classified rows' categories, reuses per merchant, and leaves abstains Uncategorized", async () => {
    const { hh, repo, acct, up } = await seedHousehold(true, "backfill-basic");
    const created = await addClassifiedNoCategory(repo, acct, up, ["Bonus", "Bonus", "N1", "Mystery"]);

    let calls = 0;
    const counting: Classifier = async (txn) => {
      calls += 1;
      return byMerchant(txn);
    };
    const result = await backfillCategories(repo, counting);

    expect(result.scanned).toBe(4);
    expect(result.backfilled).toBe(3); // two Bonus + one N1; Mystery abstains
    expect(calls).toBe(3); // one model call per distinct merchant (Bonus reused)

    const slugToId = await repo.categories.leafSlugToId();
    const rows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, hh.id), eq(transactions.merchant, "Bonus")));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.categoryId === slugToId.get("groceries"))).toBe(true);
    const mystery = await repo.transactions.findById(created[3].id);
    expect(mystery?.categoryId).toBeNull(); // abstain → Uncategorized
  });

  it("does not overwrite an already-assigned Category", async () => {
    const { repo, acct, up } = await seedHousehold(true, "backfill-idempotent");
    const slugToId = await repo.categories.leafSlugToId();
    const [row] = await repo.transactions.createMany([
      { accountId: acct.id, uploadId: up.id, date: "2026-03-10", amount: -1000, merchant: "Bonus", rawCategory: "", sourceRow: 0 },
    ]);
    // Already categorized as fuel; backfill would say groceries — must not touch it.
    await repo.transactions.classify(row.id, {
      expenseType: "Necessary",
      categoryId: slugToId.get("fuel"),
      categoryConfidence: 0.9,
    });
    const result = await backfillCategories(repo, byMerchant);
    expect(result.scanned).toBe(0); // not a candidate — already has a Category
    expect((await repo.transactions.findById(row.id))?.categoryId).toBe(slugToId.get("fuel"));
  });

  it("seeds the taxonomy first for a household that has none", async () => {
    const { repo, acct, up } = await seedHousehold(false, "backfill-unseeded");
    expect((await repo.categories.list())).toHaveLength(0); // no categories yet
    await addClassifiedNoCategory(repo, acct, up, ["Bonus"]);

    const result = await backfillCategories(repo, byMerchant);
    expect((await repo.categories.list()).length).toBeGreaterThan(0); // seeded
    expect(result.backfilled).toBe(1);
  });
});
