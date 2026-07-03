import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { computeFinancialHealth, loadFinancialHealth, type HealthCycle } from "./financial-health";

/** A completed cycle with the given flows; income/offcard default so tests state only what matters. */
function cycle(cycleKey: string, over: Partial<Omit<HealthCycle, "cycleKey">> = {}): HealthCycle {
  return { cycleKey, monthlyIncome: 1000, offCardFixed: 300, cardDebits: 0, ...over };
}

describe("computeFinancialHealth", () => {
  it("has no history and null averages for no cycles", () => {
    expect(computeFinancialHealth([])).toEqual({
      completedCycles: 0,
      hasEnoughHistory: false,
      avgMonthlySaving: null,
      avgMonthlyIncome: null,
      savingsRate: null,
      monthlyBurn: null,
      profitableCount: 0,
      streakConsidered: 0,
    });
  });

  it("keeps averages null until there are at least minCycles completed cycles", () => {
    const health = computeFinancialHealth([cycle("2026-01"), cycle("2026-02")]);
    expect(health.completedCycles).toBe(2);
    expect(health.hasEnoughHistory).toBe(false);
    expect(health.avgMonthlySaving).toBeNull();
    expect(health.savingsRate).toBeNull();
    expect(health.monthlyBurn).toBeNull();
    // The streak still counts what data there is (both are profitable: 1000 - 300 - 0 = 700).
    expect(health.profitableCount).toBe(2);
    expect(health.streakConsidered).toBe(2);
  });

  it("averages saving, income, and burn over the trailing avg window, oldest-first regardless of input order", () => {
    // Fed newest-first to prove the defensive sort; only the last 3 (by cycle key) feed the averages.
    const health = computeFinancialHealth([
      cycle("2026-03", { cardDebits: 300 }), // saving 400, burn 600
      cycle("2026-02", { cardDebits: 200 }), // saving 500, burn 500
      cycle("2026-01", { cardDebits: 100 }), // saving 600, burn 400
      cycle("2025-12", { cardDebits: 900 }), // outside the 3-cycle window — ignored by the averages
    ]);
    expect(health.completedCycles).toBe(4);
    expect(health.hasEnoughHistory).toBe(true);
    expect(health.avgMonthlySaving).toBe(500); // mean(600, 500, 400)
    expect(health.avgMonthlyIncome).toBe(1000);
    expect(health.monthlyBurn).toBe(500); // mean(400, 500, 600)
    expect(health.savingsRate).toBe(0.5); // 500 / 1000
  });

  it("returns a null savings rate when average income is zero (can't divide)", () => {
    const health = computeFinancialHealth([
      cycle("2026-01", { monthlyIncome: 0, offCardFixed: 0, cardDebits: 100 }),
      cycle("2026-02", { monthlyIncome: 0, offCardFixed: 0, cardDebits: 200 }),
      cycle("2026-03", { monthlyIncome: 0, offCardFixed: 0, cardDebits: 300 }),
    ]);
    expect(health.avgMonthlyIncome).toBe(0);
    expect(health.avgMonthlySaving).toBe(-200); // mean(-100, -200, -300)
    expect(health.savingsRate).toBeNull();
  });

  it("counts profitable cycles over the streak window, and only losing cycles drop out", () => {
    // 7 cycles; streak window is the last 6. The oldest (2025-10) is outside the window.
    const health = computeFinancialHealth(
      [
        cycle("2025-10", { cardDebits: 5000 }), // losing, but outside the window anyway
        cycle("2025-11", { cardDebits: 0 }), // +700
        cycle("2025-12", { cardDebits: 5000 }), // losing (-4300)
        cycle("2026-01", { cardDebits: 0 }), // +700
        cycle("2026-02", { cardDebits: 0 }), // +700
        cycle("2026-03", { cardDebits: 0 }), // +700
        cycle("2026-04", { cardDebits: 0 }), // +700
      ],
      { avgWindow: 3, streakWindow: 6 },
    );
    expect(health.streakConsidered).toBe(6);
    expect(health.profitableCount).toBe(5); // last 6, all profitable except 2025-12
  });
});

describe("loadFinancialHealth", () => {
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

  const NOW = new Date("2026-03-15T12:00:00Z");

  it("resolves income/off-card/debits per completed cycle and excludes the in-progress month", async () => {
    const repo = await freshHousehold();
    const [account] = await repo.accounts.create({ name: "Visa" });
    const [upload] = await repo.uploads.create({
      accountId: account.id,
      fileName: "h.csv",
      fileHash: "h",
    });
    const base = { accountId: account.id, uploadId: upload.id, rawCategory: "" };
    await repo.transactions.createMany([
      { ...base, date: "2025-12-10", amount: -100, merchant: "DEC", sourceRow: 0 },
      { ...base, date: "2026-01-10", amount: -200, merchant: "JAN", sourceRow: 1 },
      { ...base, date: "2026-02-10", amount: -300, merchant: "FEB", sourceRow: 2 },
      // March is the in-progress current month — a huge debit here must not enter any number.
      { ...base, date: "2026-03-05", amount: -9000, merchant: "MAR", sourceRow: 3 },
    ]);
    // Income + off-card start in December, so cycles before then have no income/spend and drop out —
    // leaving exactly the three completed cycles Dec/Jan/Feb.
    await repo.savings.incomeSources.replace([
      { name: "Salary", amount: 1000, effectiveFrom: "2025-12" },
    ]);
    await repo.savings.offcardCosts.replace([
      { name: "Rent", monthlyAmount: 300, effectiveFrom: "2025-12" },
    ]);

    const health = await loadFinancialHealth(repo, NOW);
    expect(health.completedCycles).toBe(3);
    expect(health.hasEnoughHistory).toBe(true);
    // Dec 600, Jan 500, Feb 400.
    expect(health.avgMonthlySaving).toBe(500);
    expect(health.avgMonthlyIncome).toBe(1000);
    expect(health.savingsRate).toBe(0.5);
    // burn = off-card 300 + debits, mean(400, 500, 600).
    expect(health.monthlyBurn).toBe(500);
    expect(health.profitableCount).toBe(3);
    expect(health.streakConsidered).toBe(3);
  });

  it("never counts another household's transactions", async () => {
    const a = await freshHousehold();
    const b = await freshHousehold();
    const [accB] = await b.accounts.create({ name: "B-Visa" });
    const [upB] = await b.uploads.create({ accountId: accB.id, fileName: "b.csv", fileHash: "b" });
    await b.transactions.create({
      accountId: accB.id,
      uploadId: upB.id,
      date: "2026-01-12",
      amount: -777,
      merchant: "B-ONLY",
      rawCategory: "",
      sourceRow: 0,
    });
    await b.savings.incomeSources.replace([
      { name: "Salary", amount: 1000, effectiveFrom: "2025-12" },
    ]);

    // A has no income configured and no spend — nothing to average.
    const health = await loadFinancialHealth(a, NOW);
    expect(health.completedCycles).toBe(0);
    expect(health.hasEnoughHistory).toBe(false);
    expect(health.avgMonthlySaving).toBeNull();
  });
});
