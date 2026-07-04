import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

describe("transactions.netByAccount", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
  const RANGE = { from: "2026-03-01", to: "2026-04-01" };

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  async function freshHousehold() {
    const [h] = await db.insert(households).values({}).returning();
    return householdRepo(asRepoDb(db), h.id);
  }

  it("sums the raw signed amount per account, including credits, excluded, and transfer rows", async () => {
    const repo = await freshHousehold();
    const [bank] = await repo.accounts.create({ name: "Bank" });
    const [card] = await repo.accounts.create({ name: "Card" });
    const [up] = await repo.uploads.create({ accountId: bank.id, fileName: "m.csv", fileHash: "m" });
    const mk = (accountId: string, sourceRow: number, date: string, amount: number, merchant: string) => ({
      accountId, uploadId: up.id, date, amount, merchant, rawCategory: "", sourceRow,
    });
    const rows = await repo.transactions.createMany([
      mk(bank.id, 0, "2026-03-05", 300_000, "SALARY"), // credit — counts toward the balance
      mk(bank.id, 1, "2026-03-10", -50_000, "CARD PAYMENT"),
      mk(card.id, 2, "2026-03-11", -8_000, "SHOP"),
      mk(card.id, 3, "2026-02-20", -9_999, "OUT OF RANGE"), // excluded by the date window
    ]);
    // Excluding a row must NOT drop it from the balance (real money still moved).
    await repo.transactions.setExcluded(rows[2].id, true);

    const net = await repo.transactions.netByAccount(RANGE);
    const byName = Object.fromEntries(net.map((r) => [r.name, r.net]));
    expect(byName).toEqual({ Bank: 250_000, Card: -8_000 });
  });

  it("scopes to the household", async () => {
    const a = await freshHousehold();
    const b = await freshHousehold();
    const [accB] = await b.accounts.create({ name: "B" });
    const [upB] = await b.uploads.create({ accountId: accB.id, fileName: "b.csv", fileHash: "b" });
    await b.transactions.create({
      accountId: accB.id, uploadId: upB.id, date: "2026-03-09", amount: -1_000, merchant: "B", rawCategory: "", sourceRow: 0,
    });
    expect(await a.transactions.netByAccount(RANGE)).toEqual([]);
  });
});
