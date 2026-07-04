import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import type { ExpenseType } from "@/shared/types";

import {
  addConfiguredAmounts,
  computeNetSummary,
  loadNetSummary,
  toEffectiveType,
} from "./net-summary";

describe("toEffectiveType", () => {
  it("passes through known expense types (including the empty not-bucketed type)", () => {
    for (const t of ["Fixed", "Necessary", "Nice to have", ""] as const) {
      expect(toEffectiveType(t)).toBe(t);
    }
  });

  it("resolves null and unexpected values to null", () => {
    expect(toEffectiveType(null)).toBeNull();
    expect(toEffectiveType("Splurge")).toBeNull();
  });
});

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

  it("sums marked income and expenses and buckets the expense side by effective type", () => {
    const summary = computeNetSummary([
      { amount: 1000, incomeMarked: true, effectiveType: "" },
      { amount: -300, incomeMarked: false, effectiveType: "Fixed" },
      { amount: -200, incomeMarked: false, effectiveType: "Necessary" },
      { amount: -100, incomeMarked: false, effectiveType: "Nice to have" },
      { amount: -50, incomeMarked: false, effectiveType: "" },
      { amount: -40, incomeMarked: false, effectiveType: null },
    ]);
    expect(summary).toEqual({
      income: 1000,
      expense: -690,
      net: 310,
      byExpenseType: { Fixed: -300, Necessary: -200, "Nice to have": -100, "": -50 },
      unclassified: -40,
    });
  });

  it("excludes unmarked credits from income, expenses, and net (ADR-0009)", () => {
    const summary = computeNetSummary([
      // e.g. a 100K transfer from a bank account onto the card — not revenue.
      { amount: 100_000, incomeMarked: false, effectiveType: "" },
      { amount: 500, incomeMarked: true, effectiveType: "" },
      { amount: -300, incomeMarked: false, effectiveType: "Fixed" },
    ]);
    expect(summary.income).toBe(500);
    expect(summary.expense).toBe(-300);
    expect(summary.net).toBe(200);
  });

  it("counts an unexpected effective type as unclassified rather than corrupting a bucket", () => {
    const summary = computeNetSummary([
      { amount: -75, incomeMarked: false, effectiveType: "Mystery" as ExpenseType },
    ]);
    expect(summary.unclassified).toBe(-75);
    expect(summary.byExpenseType).toEqual({ Fixed: 0, Necessary: 0, "Nice to have": 0, "": 0 });
    const bucketed = Object.values(summary.byExpenseType).reduce((a, b) => a + b, 0);
    expect(bucketed + summary.unclassified).toBe(summary.expense);
  });

  it("keeps the reconciliation invariants", () => {
    const summary = computeNetSummary([
      { amount: 500, incomeMarked: true, effectiveType: null },
      { amount: -120, incomeMarked: false, effectiveType: "Fixed" },
      { amount: -80, incomeMarked: false, effectiveType: null },
    ]);
    const bucketed = Object.values(summary.byExpenseType).reduce((a, b) => a + b, 0);
    expect(bucketed + summary.unclassified).toBe(summary.expense);
    expect(summary.income + summary.expense).toBe(summary.net);
  });
});

describe("addConfiguredAmounts", () => {
  const base = computeNetSummary([
    { amount: 1000, incomeMarked: true, effectiveType: "" },
    { amount: -300, incomeMarked: false, effectiveType: "Fixed" },
  ]);

  it("adds Monthly income to income and Off-card fixed costs to the expense side (Fixed bucket)", () => {
    const summary = addConfiguredAmounts(base, { monthlyIncome: 5000, offCardFixed: 2000 });
    expect(summary.income).toBe(6000); // 1000 marked + 5000 configured
    expect(summary.expense).toBe(-2300); // -300 card debit - 2000 off-card
    expect(summary.net).toBe(3700); // 6000 - 2300
    expect(summary.byExpenseType.Fixed).toBe(-2300); // -300 card Fixed - 2000 off-card
    expect(summary.unclassified).toBe(base.unclassified);
  });

  it("keeps both reconciliation invariants", () => {
    const summary = addConfiguredAmounts(base, { monthlyIncome: 5000, offCardFixed: 2000 });
    const bucketed = Object.values(summary.byExpenseType).reduce((a, b) => a + b, 0);
    expect(bucketed + summary.unclassified).toBe(summary.expense);
    expect(summary.income + summary.expense).toBe(summary.net);
  });

  it("only touches the Fixed bucket, leaving other expense types alone", () => {
    const withTypes = computeNetSummary([
      { amount: -300, incomeMarked: false, effectiveType: "Fixed" },
      { amount: -200, incomeMarked: false, effectiveType: "Necessary" },
      { amount: -100, incomeMarked: false, effectiveType: "Nice to have" },
    ]);
    const summary = addConfiguredAmounts(withTypes, { monthlyIncome: 0, offCardFixed: 2000 });
    expect(summary.byExpenseType).toEqual({
      Fixed: -2300,
      Necessary: -200,
      "Nice to have": -100,
      "": 0,
    });
  });

  it("is a no-op for zero configured amounts", () => {
    expect(addConfiguredAmounts(base, { monthlyIncome: 0, offCardFixed: 0 })).toEqual(base);
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
    // The 4th row (UNKNOWN) is intentionally left pending — never classified — so it lands in the
    // `unclassified` bucket; its binding is skipped.
    const [credit, fixed, overridden, , beforeRange, onUpperBound, transfer] =
      await repo.transactions.createMany([
        { ...base, date: "2026-03-05", amount: 1000, merchant: "SALARY", sourceRow: 0 },
        { ...base, date: "2026-03-10", amount: -300, merchant: "RENT", sourceRow: 1 },
        { ...base, date: "2026-03-15", amount: -200, merchant: "BONUS BUY", sourceRow: 2 },
        { ...base, date: "2026-03-20", amount: -100, merchant: "UNKNOWN", sourceRow: 3 },
        { ...base, date: "2026-02-28", amount: -999, merchant: "OLD", sourceRow: 4 },
        { ...base, date: "2026-04-01", amount: -50, merchant: "NEXT CYCLE", sourceRow: 5 },
        // An unmarked in-range credit (e.g. a card-bill payment) — must count for nothing.
        { ...base, date: "2026-03-06", amount: 100_000, merchant: "TRANSFER", sourceRow: 6 },
      ]);

    await repo.transactions.classify(credit.id, { expenseType: "" });
    await repo.transactions.classify(transfer.id, { expenseType: "" });
    // Only the manually marked credit is income (ADR-0009).
    await repo.transactions.setIncomeMarked(credit.id, true);
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
