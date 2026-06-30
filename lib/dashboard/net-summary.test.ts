import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { computeNetSummary, loadNetSummary } from "./net-summary";

describe("computeNetSummary", () => {
  it("is all zero for no rows", () => {
    expect(computeNetSummary([])).toEqual({
      income: 0,
      expense: 0,
      net: 0,
      byExpenseType: { Fixed: 0, Necessary: 0, "Nice to have": 0, "": 0 },
      unclassified: 0,
    });
  });

  it("sums income and expenses and buckets the expense side by effective type", () => {
    const summary = computeNetSummary([
      { amount: 1000, effectiveType: "" },
      { amount: -300, effectiveType: "Fixed" },
      { amount: -200, effectiveType: "Necessary" },
      { amount: -100, effectiveType: "Nice to have" },
      { amount: -50, effectiveType: "" },
      { amount: -40, effectiveType: null },
    ]);
    expect(summary).toEqual({
      income: 1000,
      expense: -690,
      net: 310,
      byExpenseType: { Fixed: -300, Necessary: -200, "Nice to have": -100, "": -50 },
      unclassified: -40,
    });
  });

  it("keeps the reconciliation invariants", () => {
    const summary = computeNetSummary([
      { amount: 500, effectiveType: null },
      { amount: -120, effectiveType: "Fixed" },
      { amount: -80, effectiveType: null },
    ]);
    const bucketed = Object.values(summary.byExpenseType).reduce((a, b) => a + b, 0);
    expect(bucketed + summary.unclassified).toBe(summary.expense);
    expect(summary.income + summary.expense).toBe(summary.net);
  });
});

describe("loadNetSummary", () => {
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

  it("aggregates one cycle with overrides winning and out-of-range rows excluded", async () => {
    const repo = await freshHousehold();
    const [account] = await repo.accounts.create({ name: "Visa" });
    const [upload] = await repo.uploads.create({
      accountId: account.id,
      fileName: "mar.csv",
      fileHash: "mar",
    });
    const base = { accountId: account.id, uploadId: upload.id, rawCategory: "" };
    const [credit, fixed, overridden, pending, beforeRange, onUpperBound] =
      await repo.transactions.createMany([
        { ...base, date: "2026-03-05", amount: 1000, merchant: "SALARY", sourceRow: 0 },
        { ...base, date: "2026-03-10", amount: -300, merchant: "RENT", sourceRow: 1 },
        { ...base, date: "2026-03-15", amount: -200, merchant: "BONUS BUY", sourceRow: 2 },
        { ...base, date: "2026-03-20", amount: -100, merchant: "UNKNOWN", sourceRow: 3 },
        { ...base, date: "2026-02-28", amount: -999, merchant: "OLD", sourceRow: 4 },
        { ...base, date: "2026-04-01", amount: -50, merchant: "NEXT CYCLE", sourceRow: 5 },
      ]);

    await repo.transactions.classify(credit.id, { expenseType: "" });
    await repo.transactions.classify(fixed.id, { expenseType: "Fixed" });
    await repo.transactions.classify(overridden.id, { expenseType: "Necessary" });
    await repo.transactions.classify(beforeRange.id, { expenseType: "Fixed" });
    await repo.transactions.classify(onUpperBound.id, { expenseType: "Fixed" });
    // pending stays unclassified. The manual override must win over the classified "Necessary".
    await repo.overrides.create({ transactionId: overridden.id, expenseType: "Nice to have" });

    const summary = await loadNetSummary(repo, MARCH);
    expect(summary).toEqual({
      income: 1000,
      expense: -600, // -300 + -200 + -100; Feb and Apr-1 rows are outside [from, to)
      net: 400,
      byExpenseType: { Fixed: -300, Necessary: 0, "Nice to have": -200, "": 0 },
      unclassified: -100,
    });
  });

  it("never counts another household's transactions", async () => {
    const a = await freshHousehold();
    const b = await freshHousehold();
    const [accB] = await b.accounts.create({ name: "B-Visa" });
    const [upB] = await b.uploads.create({ accountId: accB.id, fileName: "b.csv", fileHash: "b" });
    const [txnB] = await b.transactions.create({
      accountId: accB.id,
      uploadId: upB.id,
      date: "2026-03-12",
      amount: -777,
      merchant: "B-ONLY",
      rawCategory: "",
      sourceRow: 0,
    });
    await b.transactions.classify(txnB.id, { expenseType: "Fixed" });

    // A has nothing in March; B's in-range expense must not leak into A's summary.
    expect(await loadNetSummary(a, MARCH)).toEqual({
      income: 0,
      expense: 0,
      net: 0,
      byExpenseType: { Fixed: 0, Necessary: 0, "Nice to have": 0, "": 0 },
      unclassified: 0,
    });
  });
});
