import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { buildTopMerchants, loadTopMerchants } from "./top-merchants";

describe("buildTopMerchants", () => {
  it("is empty for no rows", () => {
    expect(buildTopMerchants([], 6)).toEqual([]);
  });

  it("merges by normalized merchant, computes share of total, and sorts by spend desc", () => {
    const result = buildTopMerchants(
      [
        { merchant: "BONUS 0123", spending: 300 },
        { merchant: "bonus 4567", spending: 200 }, // -> BONUS, merged to 500
        { merchant: "Netto Kringlan", spending: 200 },
        { merchant: "N1 #45", spending: 150 },
        { merchant: "N1 #99", spending: 100 }, // -> N1, merged to 250
        { merchant: "Kaffitár", spending: 50 },
      ],
      6,
    );
    expect(result).toEqual([
      { merchant: "BONUS", spending: 500, share: 0.5 },
      { merchant: "N1", spending: 250, share: 0.25 },
      { merchant: "NETTO KRINGLAN", spending: 200, share: 0.2 },
      { merchant: "KAFFITÁR", spending: 50, share: 0.05 },
    ]);
  });

  it("respects the limit after merging (top N by spend)", () => {
    const result = buildTopMerchants(
      [
        { merchant: "BONUS 0123", spending: 300 },
        { merchant: "bonus 4567", spending: 200 },
        { merchant: "N1 #45", spending: 250 },
        { merchant: "Kaffitár", spending: 50 },
      ],
      2,
    );
    // Shares are of the whole period's spend (total 800), even though only the top 2 are returned.
    expect(result).toEqual([
      { merchant: "BONUS", spending: 500, share: 0.625 },
      { merchant: "N1", spending: 250, share: 0.3125 },
    ]);
  });

  it("breaks ties by merchant name for a stable order", () => {
    expect(buildTopMerchants([
      { merchant: "ZED", spending: 100 },
      { merchant: "ALPHA", spending: 100 },
    ], 6)).toEqual([
      { merchant: "ALPHA", spending: 100, share: 0.5 },
      { merchant: "ZED", spending: 100, share: 0.5 },
    ]);
  });
});

describe("loadTopMerchants", () => {
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

  const MARCH = { from: "2026-03-01", to: "2026-04-01" };

  it("sums debit magnitude by normalized merchant, ignoring credits and out-of-range rows", async () => {
    const repo = await freshHousehold();
    const [account] = await repo.accounts.create({ name: "Visa" });
    const [upload] = await repo.uploads.create({
      accountId: account.id,
      fileName: "m.csv",
      fileHash: "m",
    });
    const base = { accountId: account.id, uploadId: upload.id, rawCategory: "" };
    await repo.transactions.createMany([
      { ...base, date: "2026-03-05", amount: -200, merchant: "BONUS 0123", sourceRow: 0 },
      { ...base, date: "2026-03-08", amount: -100, merchant: "bonus 4567", sourceRow: 1 },
      { ...base, date: "2026-03-12", amount: -200, merchant: "Netto Kringlan", sourceRow: 2 },
      { ...base, date: "2026-03-15", amount: 50, merchant: "REFUND", sourceRow: 3 }, // credit, excluded
      { ...base, date: "2026-02-15", amount: -999, merchant: "OLD", sourceRow: 4 }, // out of range
    ]);

    const result = await loadTopMerchants(repo, MARCH, 6);
    expect(result).toEqual([
      { merchant: "BONUS", spending: 300, share: 0.6 },
      { merchant: "NETTO KRINGLAN", spending: 200, share: 0.4 },
    ]);
  });

  it("never counts another household's transactions", async () => {
    const a = await freshHousehold();
    const b = await freshHousehold();
    const [accB] = await b.accounts.create({ name: "B-Visa" });
    const [upB] = await b.uploads.create({ accountId: accB.id, fileName: "b.csv", fileHash: "b" });
    await b.transactions.create({
      accountId: accB.id,
      uploadId: upB.id,
      date: "2026-03-12",
      amount: -777,
      merchant: "B-ONLY",
      rawCategory: "",
      sourceRow: 0,
    });

    expect(await loadTopMerchants(a, MARCH, 6)).toEqual([]);
  });
});
