import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households, transactions } from "@/lib/db/schema";

import { detectAndLinkTransfers } from "./link-transfers";

describe("detectAndLinkTransfers", () => {
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

  // A -50k card-bill payment in the bank, its +50k credit on the card, and an unrelated -8k purchase.
  async function seed(repo: Awaited<ReturnType<typeof freshHousehold>>) {
    const [bank] = await repo.accounts.create({ name: "Bank" });
    const [card] = await repo.accounts.create({ name: "Card" });
    const [up] = await repo.uploads.create({ accountId: bank.id, fileName: "m.csv", fileHash: "m" });
    const [out, into, purchase] = await repo.transactions.createMany([
      { accountId: bank.id, uploadId: up.id, date: "2026-03-10", amount: -50_000, merchant: "CARD PAYMENT", rawCategory: "", sourceRow: 0 },
      { accountId: card.id, uploadId: up.id, date: "2026-03-11", amount: 50_000, merchant: "PAYMENT RECEIVED", rawCategory: "", sourceRow: 1 },
      { accountId: card.id, uploadId: up.id, date: "2026-03-12", amount: -8_000, merchant: "SHOP", rawCategory: "", sourceRow: 2 },
    ]);
    return { out, into, purchase };
  }

  it("links a detected transfer pair and leaves unrelated rows alone", async () => {
    const repo = await freshHousehold();
    const { out, into, purchase } = await seed(repo);

    expect(await detectAndLinkTransfers(repo)).toEqual({ linked: 1 });

    const outGroup = await transferGroupOf(out.id);
    expect(outGroup).toBeTruthy();
    expect(await transferGroupOf(into.id)).toBe(outGroup);
    expect(await transferGroupOf(purchase.id)).toBeNull();
  });

  it("is idempotent — a second run links nothing new", async () => {
    const repo = await freshHousehold();
    await seed(repo);

    expect(await detectAndLinkTransfers(repo)).toEqual({ linked: 1 });
    expect(await detectAndLinkTransfers(repo)).toEqual({ linked: 0 });
  });

  it("skips excluded rows so a manually-excluded leg is never auto-linked", async () => {
    const repo = await freshHousehold();
    const { out, into } = await seed(repo);
    await repo.transactions.setExcluded(out.id, true);

    expect(await detectAndLinkTransfers(repo)).toEqual({ linked: 0 });
    expect(await transferGroupOf(into.id)).toBeNull();
  });
});
