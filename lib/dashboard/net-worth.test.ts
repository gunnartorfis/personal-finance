import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import {
  computeNetWorth,
  computeRunwayMonths,
  loadNetWorth,
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
