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

  it("links corroborated bank transfers in the selected month and preserves other bank entries", async () => {
    const repo = await freshHousehold();
    const [from] = await repo.accounts.create({ name: "Current" });
    const [to] = await repo.accounts.create({ name: "Savings" });
    const bankRow = (accountId: string, date: string, amount: number, merchant: string, externalId: string) => ({
      accountId, date, amount, merchant, externalId, source: "bank_sync" as const, rawCategory: "",
    });
    const [out, incoming, expense, credit, markedOut, markedIncome, earlier, earlierCredit] =
      await repo.transactions.createSyncedMany([
        bankRow(from.id, "2026-03-10", -5000, "Bank Customer", "1"),
        bankRow(to.id, "2026-03-10", 5000, "bank  customer", "2"),
        bankRow(from.id, "2026-03-10", -2000, "Shop", "3"),
        bankRow(to.id, "2026-03-10", 2000, "Bank Customer", "4"),
        bankRow(from.id, "2026-03-10", -7000, "Bank Customer", "5"),
        { ...bankRow(to.id, "2026-03-10", 7000, "Bank Customer", "6"), incomeMarked: true },
        bankRow(from.id, "2026-02-10", -5000, "Bank Customer", "7"),
        bankRow(to.id, "2026-02-10", 5000, "Bank Customer", "8"),
      ]);
    const range = { from: "2026-03-01", to: "2026-04-01" };
    expect(await detectAndLinkTransfers(repo, { bankOnly: true, range })).toEqual({ linked: 1 });
    const group = await transferGroupOf(out.id);
    expect(group).toBeTruthy();
    expect(await transferGroupOf(incoming.id)).toBe(group);
    for (const row of [expense, credit, markedOut, markedIncome, earlier, earlierCredit]) {
      expect(await transferGroupOf(row.id)).toBeNull();
    }
    expect((await repo.transactions.summaryRows(range)).map(({ amount }) => amount).sort((a, b) => a - b))
      .toEqual([-7000, -2000, 2000, 7000]);
  });

  it("skips excluded rows so a manually-excluded leg is never auto-linked", async () => {
    const repo = await freshHousehold();
    const { out, into } = await seed(repo);
    await repo.transactions.setExcluded(out.id, true);

    expect(await detectAndLinkTransfers(repo)).toEqual({ linked: 0 });
    expect(await transferGroupOf(into.id)).toBeNull();
  });
});
