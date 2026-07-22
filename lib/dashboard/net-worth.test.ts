import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import {
  computeAllocationShares,
  computeNetWorth,
  computeRunwayMonths,
  loadNetWorth,
  projectNetWorth,
  type BalanceSnapshot,
} from "./net-worth";

function snap(accountId: string, balance: number, asOf: string): BalanceSnapshot {
  return { accountId, balance, asOf: new Date(asOf) };
}

describe("computeNetWorth", () => {
  it("is null when there are no snapshots (hides the tile)", () => {
    expect(computeNetWorth([])).toBeNull();
  });

  it("sums the latest balance per account and reports the newest asOf", () => {
    const net = computeNetWorth([
      snap("a", 100, "2026-01-01T00:00:00Z"),
      snap("a", 250, "2026-03-01T00:00:00Z"), // newer for a — this one counts
      snap("b", 400, "2026-02-01T00:00:00Z"),
    ]);
    expect(net).toEqual({ total: 650, accountCount: 2, asOf: new Date("2026-03-01T00:00:00Z") });
  });

  it("treats a negative balance as debt that lowers net worth", () => {
    const net = computeNetWorth([
      snap("cash", 500, "2026-03-01T00:00:00Z"),
      snap("card", -200, "2026-03-01T00:00:00Z"), // credit-card debt
    ]);
    expect(net?.total).toBe(300);
    expect(net?.accountCount).toBe(2);
  });

  it("does not double-count multiple snapshots for the same account", () => {
    const net = computeNetWorth([
      snap("a", 100, "2026-01-01T00:00:00Z"),
      snap("a", 100, "2026-02-01T00:00:00Z"),
      snap("a", 100, "2026-03-01T00:00:00Z"),
    ]);
    expect(net).toEqual({ total: 100, accountCount: 1, asOf: new Date("2026-03-01T00:00:00Z") });
  });
});

describe("computeRunwayMonths", () => {
  it("divides net worth by monthly burn, rounding down so it never overstates", () => {
    expect(computeRunwayMonths(1_000_000, 200_000)).toBe(5);
    expect(computeRunwayMonths(1_050_000, 200_000)).toBe(5); // 5.25 → 5
  });

  it("is null when burn is unknown or non-positive", () => {
    expect(computeRunwayMonths(1_000_000, null)).toBeNull();
    expect(computeRunwayMonths(1_000_000, 0)).toBeNull();
    expect(computeRunwayMonths(1_000_000, -50)).toBeNull();
  });

  it("is null when net worth is zero or negative (no runway to report)", () => {
    expect(computeRunwayMonths(0, 200_000)).toBeNull();
    expect(computeRunwayMonths(-500_000, 200_000)).toBeNull();
  });
});

describe("projectNetWorth", () => {
  it("anchors at today's net worth and carries forward at the monthly saving", () => {
    const points = projectNetWorth({
      startingNetWorth: 1_000_000,
      monthlySaving: 50_000,
      startCycle: "2026-07",
      months: 12,
    });
    expect(points).toHaveLength(13); // index 0 (today) + 12 months
    expect(points[0]).toEqual({ cycleKey: "2026-07", monthIndex: 0, netWorth: 1_000_000 });
    expect(points[1]).toEqual({ cycleKey: "2026-08", monthIndex: 1, netWorth: 1_050_000 });
    expect(points[12]).toEqual({ cycleKey: "2027-07", monthIndex: 12, netWorth: 1_600_000 });
  });

  it("projects a declining line when the household is losing money", () => {
    const points = projectNetWorth({
      startingNetWorth: 300_000,
      monthlySaving: -100_000,
      startCycle: "2026-11",
      months: 3,
    });
    expect(points.map((p) => p.netWorth)).toEqual([300_000, 200_000, 100_000, 0]);
    expect(points[3].cycleKey).toBe("2027-02"); // rolls across the year boundary
  });
});

describe("loadNetWorth", () => {
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

  it("sums the latest snapshot per account from the repo", async () => {
    const repo = await freshHousehold();
    const [checking] = await repo.accounts.create({ name: "Checking" });
    const [savings] = await repo.accounts.create({ name: "Savings" });

    // Two observations for checking — the later one wins.
    await repo.accounts.balances.insert({
      accountId: checking.id,
      balance: 100_000,
      asOf: new Date("2026-02-01T00:00:00Z"),
    });
    await repo.accounts.balances.insert({
      accountId: checking.id,
      balance: 120_000,
      asOf: new Date("2026-03-01T00:00:00Z"),
    });
    await repo.accounts.balances.insert({
      accountId: savings.id,
      balance: 500_000,
      asOf: new Date("2026-03-02T00:00:00Z"),
    });

    const net = await loadNetWorth(repo);
    expect(net?.total).toBe(620_000); // 120,000 + 500,000
    expect(net?.accountCount).toBe(2);
    expect(net?.asOf).toEqual(new Date("2026-03-02T00:00:00Z"));
  });

  it("is null for a household with no balance snapshots", async () => {
    const repo = await freshHousehold();
    await repo.accounts.create({ name: "Checking" });
    expect(await loadNetWorth(repo)).toBeNull();
  });

  it("never counts another household's balances", async () => {
    const a = await freshHousehold();
    const b = await freshHousehold();
    const [accB] = await b.accounts.create({ name: "B-Checking" });
    await b.accounts.balances.insert({ accountId: accB.id, balance: 999_999 });

    expect(await loadNetWorth(a)).toBeNull();
  });
});

describe("computeAllocationShares", () => {
  it("splits pure-asset balances into shares that sum to 1", () => {
    expect(
      computeAllocationShares([
        { accountId: "ibkr", balance: 600_000 },
        { accountId: "cash", balance: 400_000 },
      ])
    ).toEqual([
      { accountId: "ibkr", share: 0.6 },
      { accountId: "cash", share: 0.4 },
    ]);
  });

  it("normalizes over assets only, so a debt account never yields a negative or >100% share", () => {
    // Net total is positive (1000 - 200 = 800); a naive balance/total would give 125% and -25%.
    expect(
      computeAllocationShares([
        { accountId: "cash", balance: 1000 },
        { accountId: "card", balance: -200 },
      ])
    ).toEqual([
      { accountId: "cash", share: 1 }, // 1000 / 1000 (assets only)
      { accountId: "card", share: null }, // debt is not part of the asset allocation
    ]);
  });

  it("gives no share when there are no positive balances", () => {
    expect(computeAllocationShares([{ accountId: "card", balance: -500 }])).toEqual([
      { accountId: "card", share: null },
    ]);
  });

  it("is empty for no accounts", () => {
    expect(computeAllocationShares([])).toEqual([]);
  });
});
