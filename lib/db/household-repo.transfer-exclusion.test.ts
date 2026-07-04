import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

// Slice 3: every spend/income aggregation must drop a detected transfer's legs, not just the net
// summary (slice 2). Seed a card-bill payment (a -50k bank debit + its +50k card credit) alongside a
// real -8k card purchase, then assert each aggregation excludes the transfer once the pair is linked.
describe("transfer legs are excluded from every aggregation", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
  const RANGE = { from: "2026-03-01", to: "2026-04-01" };

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  async function seeded() {
    const [h] = await db.insert(households).values({}).returning();
    const repo = householdRepo(asRepoDb(db), h.id);
    const [bank] = await repo.accounts.create({ name: "Bank" });
    const [card] = await repo.accounts.create({ name: "Card" });
    const [up] = await repo.uploads.create({ accountId: bank.id, fileName: "m.csv", fileHash: "m" });
    const [out, into, purchase] = await repo.transactions.createMany([
      { accountId: bank.id, uploadId: up.id, date: "2026-03-10", amount: -50_000, merchant: "CARD PAYMENT", rawCategory: "", sourceRow: 0 },
      { accountId: card.id, uploadId: up.id, date: "2026-03-11", amount: 50_000, merchant: "PAYMENT RECEIVED", rawCategory: "", sourceRow: 1 },
      { accountId: card.id, uploadId: up.id, date: "2026-03-12", amount: -8_000, merchant: "SHOP", rawCategory: "", sourceRow: 2 },
    ]);
    await repo.transactions.classify(out.id, { expenseType: "Fixed" });
    await repo.transactions.classify(purchase.id, { expenseType: "Nice to have" });
    await repo.transactions.markTransferPair(out.id, into.id);
    return { repo, card };
  }

  it("excludes the transfer debit from monthlySpendSeries", async () => {
    const { repo } = await seeded();
    const series = await repo.transactions.monthlySpendSeries(RANGE);
    const march = series.find((r) => r.month === "2026-03");
    expect(march?.spending).toBe(8_000); // 50k card payment dropped
    expect(march?.income).toBe(0);
  });

  it("excludes the transfer debit from topMerchants", async () => {
    const { repo } = await seeded();
    const merchants = await repo.transactions.topMerchants(RANGE);
    expect(merchants.map((m) => m.merchant)).not.toContain("CARD PAYMENT");
    expect(merchants).toEqual([{ merchant: "SHOP", spending: 8_000 }]);
  });

  it("excludes the transfer debit from monthlyCategorySpend", async () => {
    const { repo } = await seeded();
    const cats = await repo.transactions.monthlyCategorySpend(RANGE);
    expect(cats.find((c) => c.effectiveType === "Fixed")).toBeUndefined();
    expect(cats).toEqual([{ month: "2026-03", effectiveType: "Nice to have", spending: 8_000 }]);
  });

  it("excludes the transfer debit from monthlyMerchantSpend", async () => {
    const { repo } = await seeded();
    const movers = await repo.transactions.monthlyMerchantSpend(RANGE);
    expect(movers.map((m) => m.merchant)).not.toContain("CARD PAYMENT");
  });

  it("excludes the transfer debit from largestCharge", async () => {
    const { repo } = await seeded();
    // Without exclusion the -50k payment would be the largest charge; now it's the -8k purchase.
    expect(await repo.transactions.largestCharge(RANGE)).toEqual({ merchant: "SHOP", amount: 8_000 });
  });

  it("excludes the transfer debit from spendByAccount", async () => {
    const { repo } = await seeded();
    const byAccount = await repo.transactions.spendByAccount(RANGE);
    // The bank account's only debit was the transfer, so it drops out entirely.
    expect(byAccount.map((a) => a.name)).not.toContain("Bank");
    expect(byAccount).toEqual([{ accountId: expect.any(String), name: "Card", spending: 8_000 }]);
  });
});
