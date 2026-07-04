import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { loadRecurring } from "./recurring";

describe("loadRecurring", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
  const NOW = new Date("2026-04-15T00:00:00Z");

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  async function freshHousehold() {
    const [h] = await db.insert(households).values({}).returning();
    return householdRepo(asRepoDb(db), h.id);
  }

  it("detects a subscription across months and ignores credits, excluded, and transfer legs", async () => {
    const repo = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Visa" });
    const [up] = await repo.uploads.create({ accountId: acct.id, fileName: "s.csv", fileHash: "s" });
    const mk = (sourceRow: number, date: string, amount: number, merchant: string) => ({
      accountId: acct.id,
      uploadId: up.id,
      date,
      amount,
      merchant,
      rawCategory: "",
      sourceRow,
    });
    const rows = await repo.transactions.createMany([
      mk(0, "2026-02-03", -1_990, "NETFLIX"),
      mk(1, "2026-03-03", -1_990, "NETFLIX"),
      mk(2, "2026-04-03", -1_990, "NETFLIX"),
      // A credit — never a subscription.
      mk(3, "2026-03-10", 5_000, "REFUND"),
      // An excluded debit that would otherwise look recurring.
      mk(4, "2026-02-04", -800, "EXCLUDED SUB"),
      mk(5, "2026-03-04", -800, "EXCLUDED SUB"),
      mk(6, "2026-04-04", -800, "EXCLUDED SUB"),
    ]);
    await repo.transactions.setExcluded(rows[4].id, true);
    await repo.transactions.setExcluded(rows[5].id, true);
    await repo.transactions.setExcluded(rows[6].id, true);

    const summary = await loadRecurring(repo, NOW);

    expect(summary.subscriptions).toEqual([
      { merchant: "NETFLIX", monthlyAmount: 1_990, occurrences: 3, lastMonth: "2026-04" },
    ]);
    expect(summary.committedMonthlyTotal).toBe(1_990);
  });

  it("never sees another household's charges", async () => {
    const a = await freshHousehold();
    const b = await freshHousehold();
    const [acctB] = await b.accounts.create({ name: "B" });
    const [upB] = await b.uploads.create({ accountId: acctB.id, fileName: "b.csv", fileHash: "b" });
    await b.transactions.createMany(
      ["2026-02-03", "2026-03-03", "2026-04-03"].map((date, i) => ({
        accountId: acctB.id,
        uploadId: upB.id,
        date,
        amount: -1_200,
        merchant: "SPOTIFY",
        rawCategory: "",
        sourceRow: i,
      })),
    );

    expect(await loadRecurring(a, NOW)).toEqual({ subscriptions: [], committedMonthlyTotal: 0 });
  });
});
