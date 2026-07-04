import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { loadNetSummary } from "@/lib/dashboard/net-summary";
import { householdRepo } from "@/lib/db/household-repo";
import { households, transactions } from "@/lib/db/schema";

describe("transaction transfer links", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  async function freshHousehold() {
    const [h] = await db.insert(households).values({}).returning();
    return householdRepo(asRepoDb(db), h.id);
  }

  async function transferGroupOf(id: string) {
    const [row] = await db
      .select({ g: transactions.transferGroupId })
      .from(transactions)
      .where(eq(transactions.id, id));
    return row.g;
  }

  // A card-bill payment (-50k debit in the bank Account, +50k credit landing on the card) plus a
  // real purchase on the card that must keep counting.
  async function seed(repo: Awaited<ReturnType<typeof freshHousehold>>) {
    const [bank] = await repo.accounts.create({ name: "Bank" });
    const [card] = await repo.accounts.create({ name: "Card" });
    const [up] = await repo.uploads.create({
      accountId: bank.id,
      fileName: "m.csv",
      fileHash: "m",
    });
    const [out, into, purchase] = await repo.transactions.createMany([
      { accountId: bank.id, uploadId: up.id, date: "2026-03-10", amount: -50_000, merchant: "CARD PAYMENT", rawCategory: "", sourceRow: 0 },
      { accountId: card.id, uploadId: up.id, date: "2026-03-11", amount: 50_000, merchant: "PAYMENT RECEIVED", rawCategory: "", sourceRow: 1 },
      { accountId: card.id, uploadId: up.id, date: "2026-03-12", amount: -8_000, merchant: "SHOP", rawCategory: "", sourceRow: 2 },
    ]);
    await repo.transactions.classify(purchase.id, { expenseType: "Nice to have" });
    return { out, into, purchase };
  }

  const MARCH = { from: "2026-03-01", to: "2026-04-01" };

  it("marks both legs with a shared transfer group id", async () => {
    const repo = await freshHousehold();
    const { out, into } = await seed(repo);

    const { groupId, rows } = await repo.transactions.markTransferPair(out.id, into.id);

    expect(groupId).toBeTruthy();
    expect(rows).toHaveLength(2);
    expect(await transferGroupOf(out.id)).toBe(groupId);
    expect(await transferGroupOf(into.id)).toBe(groupId);
  });

  it("drops a transfer's debit leg from the net summary (no double-count)", async () => {
    const repo = await freshHousehold();
    const { out, into } = await seed(repo);

    // Before marking: the -50k card payment double-counts on top of the -8k purchase.
    const before = await loadNetSummary(repo, MARCH);
    expect(before.expense).toBe(-58_000);

    await repo.transactions.markTransferPair(out.id, into.id);

    const after = await loadNetSummary(repo, MARCH);
    expect(after.expense).toBe(-8_000);
    expect(after.income).toBe(0);
  });

  it("never links another household's transactions", async () => {
    const a = await freshHousehold();
    const b = await freshHousehold();
    const aLegs = await seed(a);
    const bLegs = await seed(b);

    // A tries to pair its debit with B's credit — cross-tenant, must touch nothing.
    const { rows } = await a.transactions.markTransferPair(aLegs.out.id, bLegs.into.id);
    expect(rows).toHaveLength(0);
    expect(await transferGroupOf(aLegs.out.id)).toBeNull();
    expect(await transferGroupOf(bLegs.into.id)).toBeNull();
  });
});
