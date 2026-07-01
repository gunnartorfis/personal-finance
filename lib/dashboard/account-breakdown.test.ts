import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { buildAccountBreakdown, loadAccountBreakdown } from "./account-breakdown";

describe("buildAccountBreakdown", () => {
  it("is empty for no rows", () => {
    expect(buildAccountBreakdown([])).toEqual([]);
  });

  it("computes share of total and sorts by spend desc", () => {
    expect(
      buildAccountBreakdown([
        { accountId: "a2", name: "Mastercard", spending: 400 },
        { accountId: "a1", name: "Visa", spending: 600 },
      ]),
    ).toEqual([
      { accountId: "a1", name: "Visa", spending: 600, share: 0.6 },
      { accountId: "a2", name: "Mastercard", spending: 400, share: 0.4 },
    ]);
  });

  it("breaks ties by account name", () => {
    expect(
      buildAccountBreakdown([
        { accountId: "z", name: "Zed", spending: 100 },
        { accountId: "a", name: "Alpha", spending: 100 },
      ]).map((a) => a.name),
    ).toEqual(["Alpha", "Zed"]);
  });
});

describe("loadAccountBreakdown", () => {
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

  it("sums debit magnitude per account (with name + share), excluding credits and out-of-range rows", async () => {
    const repo = await freshHousehold();
    const [visa] = await repo.accounts.create({ name: "Visa" });
    const [mc] = await repo.accounts.create({ name: "Mastercard" });
    const [upV] = await repo.uploads.create({ accountId: visa.id, fileName: "v.csv", fileHash: "v" });
    const [upM] = await repo.uploads.create({ accountId: mc.id, fileName: "m.csv", fileHash: "m" });
    await repo.transactions.createMany([
      { accountId: visa.id, uploadId: upV.id, date: "2026-03-05", amount: -400, merchant: "A", rawCategory: "", sourceRow: 0 },
      { accountId: visa.id, uploadId: upV.id, date: "2026-03-06", amount: -200, merchant: "B", rawCategory: "", sourceRow: 1 },
      { accountId: visa.id, uploadId: upV.id, date: "2026-03-07", amount: 100, merchant: "REFUND", rawCategory: "", sourceRow: 2 }, // credit
      { accountId: mc.id, uploadId: upM.id, date: "2026-03-10", amount: -400, merchant: "C", rawCategory: "", sourceRow: 0 },
      { accountId: mc.id, uploadId: upM.id, date: "2026-02-15", amount: -999, merchant: "OLD", rawCategory: "", sourceRow: 1 }, // out of range
    ]);

    expect(await loadAccountBreakdown(repo, MARCH)).toEqual([
      { accountId: visa.id, name: "Visa", spending: 600, share: 0.6 },
      { accountId: mc.id, name: "Mastercard", spending: 400, share: 0.4 },
    ]);
  });

  it("never counts another household's transactions", async () => {
    const a = await freshHousehold();
    const b = await freshHousehold();
    const [accB] = await b.accounts.create({ name: "B-Visa" });
    const [upB] = await b.uploads.create({ accountId: accB.id, fileName: "b3.csv", fileHash: "b3" });
    await b.transactions.create({
      accountId: accB.id,
      uploadId: upB.id,
      date: "2026-03-12",
      amount: -500,
      merchant: "B-ONLY",
      rawCategory: "",
      sourceRow: 0,
    });

    expect(await loadAccountBreakdown(a, MARCH)).toEqual([]);
  });
});
