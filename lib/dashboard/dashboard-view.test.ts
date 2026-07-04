import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";
import type { FreeCapStatus } from "@/lib/billing/free-cap-status";

import type { CategoryTrendPoint } from "./category-trend";
import type { MonthlySpendPoint } from "./monthly-series";
import { computeSpendingTrendStats } from "./spending-trend";
import { assembleDashboardView, loadDashboardView, type DashboardInputs } from "./dashboard-view";

const PREMIUM: FreeCapStatus = {
  plan: "Premium",
  unlimited: true,
  cap: 50,
  used: 0,
  remaining: Infinity,
  paused: false,
};
const FREE_PAUSED: FreeCapStatus = {
  plan: "Free",
  unlimited: false,
  cap: 50,
  used: 50,
  remaining: 0,
  paused: true,
};

function cat(month: string, byType: Partial<CategoryTrendPoint["byExpenseType"]>, unclassified = 0): CategoryTrendPoint {
  return {
    month,
    byExpenseType: { Fixed: 0, Necessary: 0, "Nice to have": 0, "": 0, ...byType },
    unclassified,
  };
}

const NOW = new Date("2026-03-15T12:00:00Z");

// A 4-month series ending at the in-progress current cycle (2026-03), with 3 completed months.
const SERIES: MonthlySpendPoint[] = [
  { month: "2025-12", spending: 200000, income: 0, difference: -200000 },
  { month: "2026-01", spending: 300000, income: 0, difference: -300000 },
  { month: "2026-02", spending: 350000, income: 0, difference: -350000 },
  { month: "2026-03", spending: 100000, income: 20000, difference: -80000 },
];

function baseInputs(overrides: Partial<DashboardInputs> = {}): DashboardInputs {
  // Derive trend from the (possibly overridden) series so the two never drift apart in a test.
  const series = overrides.series ?? SERIES;
  return {
    now: NOW,
    series,
    trend: computeSpendingTrendStats(series, NOW),
    topMerchants: [{ merchant: "BONUS", spending: 100000, share: 1 }],
    categoryTrend: [cat("2026-03", { Fixed: 60000 }, 40000)],
    movers: { merchants: [], categories: [] },
    recurring: { subscriptions: [], committedMonthlyTotal: 0 },
    budgets: {},
    largestCharge: { merchant: "BIGSHOP", amount: 50000 },
    accountBreakdown: [{ accountId: "a1", name: "Visa", spending: 100000, share: 1 }],
    accountCount: 2,
    financialHealth: {
      completedCycles: 3,
      hasEnoughHistory: true,
      avgMonthlySaving: 50000,
      avgMonthlyIncome: 250000,
      savingsRate: 0.2,
      monthlyBurn: 200000,
      profitableCount: 3,
      streakConsidered: 3,
    },
    reviewBacklog: 5,
    pendingCount: 0,
    failedCount: 0,
    freeCap: PREMIUM,
    reconnect: [],
    ...overrides,
  };
}

describe("assembleDashboardView", () => {
  it("derives the hero from the current cycle and trend stats", () => {
    const trend = computeSpendingTrendStats(SERIES, NOW);
    const view = assembleDashboardView(baseInputs());
    expect(view.hero.month).toBe("2026-03");
    expect(view.hero.isCurrent).toBe(true);
    expect(view.hero.spentSoFar).toBe(100000);
    expect(view.hero.income).toBe(20000);
    expect(view.hero.difference).toBe(-80000);
    expect(view.hero.projected).toBe(trend.projection?.projected ?? null);
    expect(view.hero.vsAveragePct).toBe(trend.vsAveragePct);
    expect(view.hero.trailingAverage).toBe(trend.trailingAverage);
    expect(view.hero.largestCharge).toEqual({ merchant: "BIGSHOP", amount: 50000 });
  });

  it("scopes the hero to a selected past cycle: final total, no projection, its own vs-average", () => {
    // A longer series so the selected past month has the required ≥3 completed months before it.
    const series: MonthlySpendPoint[] = [
      { month: "2025-11", spending: 200000, income: 0, difference: -200000 },
      { month: "2025-12", spending: 300000, income: 0, difference: -300000 },
      { month: "2026-01", spending: 400000, income: 0, difference: -400000 },
      { month: "2026-02", spending: 360000, income: 15000, difference: -345000 },
      { month: "2026-03", spending: 100000, income: 20000, difference: -80000 },
    ];
    // 2026-02 spent 360000; the completed months before it (200000, 300000, 400000) average 300000,
    // so it ran (360000-300000)/300000 = +20%.
    const view = assembleDashboardView(baseInputs({ series, selectedKey: "2026-02" }));
    expect(view.hero.month).toBe("2026-02");
    expect(view.hero.isCurrent).toBe(false);
    expect(view.hero.spentSoFar).toBe(360000);
    expect(view.hero.income).toBe(15000);
    expect(view.hero.difference).toBe(-345000);
    expect(view.hero.projected).toBeNull(); // a completed month is not projected
    expect(view.hero.trailingAverage).toBe(300000);
    expect(view.hero.vsAveragePct).toBe(20);
  });

  it("builds budget envelopes from the current cycle's category spend vs the set budgets", () => {
    // Current cycle (2026-03) has Fixed spend 60000 from the categoryTrend fixture.
    const view = assembleDashboardView(baseInputs({ budgets: { Fixed: 100_000 } }));
    expect(view.modules.budgetStatus.envelopes).toEqual([
      { type: "Fixed", budget: 100_000, spent: 60_000, remaining: 40_000, ratio: 0.6, level: "ok" },
    ]);
  });

  it("has no budget envelopes when no budgets are set", () => {
    expect(assembleDashboardView(baseInputs()).modules.budgetStatus.envelopes).toEqual([]);
  });

  it("gates modules: enough history, category nudge, and accounts shown only when >1 account", () => {
    const view = assembleDashboardView(baseInputs());
    expect(view.modules.hasEnoughHistory).toBe(true); // 3 completed months with data
    expect(view.modules.completedMonths).toBe(3);
    // Financial-health block is passed through verbatim for the section to render.
    expect(view.financialHealth.savingsRate).toBe(0.2);
    expect(view.financialHealth.hasEnoughHistory).toBe(true);
    // 40000 unclassified vs 60000 classified -> not "mostly" unclassified
    expect(view.modules.categoryMostlyUnclassified).toBe(false);
    expect(view.modules.accounts).not.toBeNull();
  });

  it("flags mostly-unclassified and hides the accounts module for a single account", () => {
    const view = assembleDashboardView(
      baseInputs({
        categoryTrend: [cat("2026-03", { Fixed: 10000 }, 90000)], // unclassified dominates
        accountCount: 1,
      }),
    );
    expect(view.modules.categoryMostlyUnclassified).toBe(true);
    expect(view.modules.accounts).toBeNull();
  });

  it("action band is all-clear only when nothing needs attention", () => {
    expect(assembleDashboardView(baseInputs({ reviewBacklog: 5 })).actionBand.allClear).toBe(false);
    expect(assembleDashboardView(baseInputs({ reviewBacklog: 0, pendingCount: 4 })).actionBand.allClear).toBe(false);
    expect(assembleDashboardView(baseInputs({ reviewBacklog: 0, failedCount: 2 })).actionBand.allClear).toBe(false);
    expect(
      assembleDashboardView(baseInputs({ reviewBacklog: 0, failedCount: 0, freeCap: FREE_PAUSED }))
        .actionBand.allClear,
    ).toBe(false);
    expect(
      assembleDashboardView(
        baseInputs({
          reviewBacklog: 0,
          failedCount: 0,
          freeCap: PREMIUM,
          reconnect: [{ id: "c1", institutionName: "Arion", reason: "error" }],
        }),
      ).actionBand.allClear,
    ).toBe(false);
    const clear = assembleDashboardView(
      baseInputs({ reviewBacklog: 0, failedCount: 0, freeCap: PREMIUM }),
    );
    expect(clear.actionBand.allClear).toBe(true);
  });

  it("zero-fills the hero when the series has no current-cycle point", () => {
    const past = SERIES.slice(0, 3); // ends 2026-02, no 2026-03
    const view = assembleDashboardView(baseInputs({ series: past })); // trend auto-derives from series
    expect(view.hero.spentSoFar).toBe(0);
    expect(view.hero.income).toBe(0);
    expect(view.hero.difference).toBe(0);
    expect(view.hero.projected).toBeNull();
  });
});

describe("loadDashboardView", () => {
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

  it("assembles a coherent view from a seeded household", async () => {
    const repo = await freshHousehold();
    const [account] = await repo.accounts.create({ name: "Visa" });
    const [upload] = await repo.uploads.create({ accountId: account.id, fileName: "d.csv", fileHash: "d" });
    const base = { accountId: account.id, uploadId: upload.id, rawCategory: "" };
    const [, salary] = await repo.transactions.createMany([
      { ...base, date: "2026-03-05", amount: -100000, merchant: "BIGSHOP", sourceRow: 0 },
      { ...base, date: "2026-03-06", amount: 20000, merchant: "SALARY", sourceRow: 1 },
      // Unmarked credit (a transfer) — must not appear in income (ADR-0009).
      { ...base, date: "2026-03-07", amount: 500000, merchant: "TRANSFER", sourceRow: 2 },
    ]);
    await repo.transactions.setIncomeMarked(salary.id, true);

    const view = await loadDashboardView(repo, NOW, { plan: "Premium", count: 12 });
    expect(view.hero.month).toBe("2026-03");
    expect(view.hero.spentSoFar).toBe(100000);
    expect(view.hero.income).toBe(20000);
    expect(view.hero.largestCharge).toEqual({ merchant: "BIGSHOP", amount: 100000 });
    expect(view.modules.accounts).toBeNull(); // single account
    expect(view.modules.series).toHaveLength(12);
    // The BIGSHOP debit is an unreviewed expense, so it shows up in the review backlog.
    expect(view.actionBand.reviewBacklog).toBe(1);
    // All three seeded rows (the debit and both credits) are still awaiting classification.
    expect(view.actionBand.pendingCount).toBe(3);
    expect(view.actionBand.allClear).toBe(false);
  });
});
