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
  { month: "2025-12", spending: 200000, moneyIn: 0, difference: -200000 },
  { month: "2026-01", spending: 300000, moneyIn: 0, difference: -300000 },
  { month: "2026-02", spending: 350000, moneyIn: 0, difference: -350000 },
  { month: "2026-03", spending: 100000, moneyIn: 20000, difference: -80000 },
];

function baseInputs(overrides: Partial<DashboardInputs> = {}): DashboardInputs {
  return {
    now: NOW,
    series: SERIES,
    trend: computeSpendingTrendStats(SERIES, NOW),
    topMerchants: [{ merchant: "BONUS", spending: 100000, share: 1 }],
    categoryTrend: [cat("2026-03", { Fixed: 60000 }, 40000)],
    movers: { merchants: [], categories: [] },
    largestCharge: { merchant: "BIGSHOP", amount: 50000 },
    accountBreakdown: [{ accountId: "a1", name: "Visa", spending: 100000, share: 1 }],
    accountCount: 2,
    reviewBacklog: 5,
    failedCount: 0,
    freeCap: PREMIUM,
    ...overrides,
  };
}

describe("assembleDashboardView", () => {
  it("derives the hero from the current cycle and trend stats", () => {
    const trend = computeSpendingTrendStats(SERIES, NOW);
    const view = assembleDashboardView(baseInputs());
    expect(view.hero.month).toBe("2026-03");
    expect(view.hero.spentSoFar).toBe(100000);
    expect(view.hero.moneyIn).toBe(20000);
    expect(view.hero.difference).toBe(-80000);
    expect(view.hero.projected).toBe(trend.projection?.projected ?? null);
    expect(view.hero.vsAveragePct).toBe(trend.vsAveragePct);
    expect(view.hero.trailingAverage).toBe(trend.trailingAverage);
    expect(view.hero.largestCharge).toEqual({ merchant: "BIGSHOP", amount: 50000 });
  });

  it("gates modules: enough history, category nudge, and accounts shown only when >1 account", () => {
    const view = assembleDashboardView(baseInputs());
    expect(view.modules.hasEnoughHistory).toBe(true); // 3 completed months with data
    expect(view.modules.completedMonths).toBe(3);
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
    expect(assembleDashboardView(baseInputs({ reviewBacklog: 0, failedCount: 2 })).actionBand.allClear).toBe(false);
    expect(
      assembleDashboardView(baseInputs({ reviewBacklog: 0, failedCount: 0, freeCap: FREE_PAUSED }))
        .actionBand.allClear,
    ).toBe(false);
    const clear = assembleDashboardView(
      baseInputs({ reviewBacklog: 0, failedCount: 0, freeCap: PREMIUM }),
    );
    expect(clear.actionBand.allClear).toBe(true);
  });

  it("zero-fills the hero when the series has no current-cycle point", () => {
    const past = SERIES.slice(0, 3); // ends 2026-02, no 2026-03
    const view = assembleDashboardView(baseInputs({ series: past, trend: computeSpendingTrendStats(past, NOW) }));
    expect(view.hero.spentSoFar).toBe(0);
    expect(view.hero.moneyIn).toBe(0);
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
    const [mar] = await repo.transactions.createMany([
      { ...base, date: "2026-03-05", amount: -100000, merchant: "BIGSHOP", sourceRow: 0 },
      { ...base, date: "2026-03-06", amount: 20000, merchant: "REFUND", sourceRow: 1 },
    ]);
    void mar;

    const view = await loadDashboardView(repo, NOW, { plan: "Premium", count: 12 });
    expect(view.hero.month).toBe("2026-03");
    expect(view.hero.spentSoFar).toBe(100000);
    expect(view.hero.moneyIn).toBe(20000);
    expect(view.hero.largestCharge).toEqual({ merchant: "BIGSHOP", amount: 100000 });
    expect(view.modules.accounts).toBeNull(); // single account
    expect(view.modules.series).toHaveLength(12);
    // The BIGSHOP debit is an unreviewed expense, so it shows up in the review backlog.
    expect(view.actionBand.reviewBacklog).toBe(1);
    expect(view.actionBand.allClear).toBe(false);
  });
});
