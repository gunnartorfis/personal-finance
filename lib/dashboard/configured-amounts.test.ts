import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { loadConfiguredAmounts, loadConfiguredAmountsByCycle } from "./configured-amounts";

describe("loadConfiguredAmountsByCycle", () => {
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

  it("returns an empty map for no cycle keys", async () => {
    const repo = await freshHousehold();
    expect(await loadConfiguredAmountsByCycle(repo, [])).toEqual(new Map());
  });

  it("resolves the income version in force per cycle and sums independent sources", async () => {
    const repo = await freshHousehold();
    await repo.savings.incomeSources.replace([
      // A salary that gets a raise from 2026-03 on.
      { name: "Salary", amount: 500_000, effectiveFrom: "2026-01" },
      { name: "Salary", amount: 550_000, effectiveFrom: "2026-03" },
      // A separate rental income that only starts 2026-02.
      { name: "Rent", amount: 100_000, effectiveFrom: "2026-02" },
    ]);

    const byCycle = await loadConfiguredAmountsByCycle(repo, [
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(byCycle.get("2026-01")?.monthlyIncome).toBe(500_000); // salary only
    expect(byCycle.get("2026-02")?.monthlyIncome).toBe(600_000); // salary + rent
    expect(byCycle.get("2026-03")?.monthlyIncome).toBe(650_000); // raised salary + rent
  });

  it("resolves off-card fixed costs the same way as income", async () => {
    const repo = await freshHousehold();
    await repo.savings.offcardCosts.replace([
      // Rent rising from 2026-03; a loan that clears (amount 0) from 2026-03.
      { name: "Rent", monthlyAmount: 200_000, effectiveFrom: "2026-01" },
      { name: "Rent", monthlyAmount: 220_000, effectiveFrom: "2026-03" },
      { name: "Loan", monthlyAmount: 50_000, effectiveFrom: "2026-01" },
      { name: "Loan", monthlyAmount: 0, effectiveFrom: "2026-03" },
    ]);

    const byCycle = await loadConfiguredAmountsByCycle(repo, ["2026-01", "2026-03"]);
    expect(byCycle.get("2026-01")?.offCardFixed).toBe(250_000); // rent + loan
    expect(byCycle.get("2026-03")?.offCardFixed).toBe(220_000); // raised rent; loan cleared
  });

  it("adds one-off adjustments to the cycle they land on, per kind", async () => {
    const repo = await freshHousehold();
    await repo.savings.incomeSources.replace([
      { name: "Salary", amount: 500_000, effectiveFrom: "2026-01" },
    ]);
    await repo.savings.offcardCosts.replace([
      { name: "Rent", monthlyAmount: 200_000, effectiveFrom: "2026-01" },
    ]);
    await repo.savings.oneOffAdjustments.replace([
      { cycleKey: "2026-02", kind: "income", amount: 50_000, label: "Bonus" },
      { cycleKey: "2026-02", kind: "cost", amount: 9_999, label: "One-time bill" },
    ]);

    const byCycle = await loadConfiguredAmountsByCycle(repo, ["2026-01", "2026-02"]);
    expect(byCycle.get("2026-01")).toEqual({ monthlyIncome: 500_000, offCardFixed: 200_000 });
    expect(byCycle.get("2026-02")).toEqual({
      monthlyIncome: 550_000, // salary + income one-off
      offCardFixed: 209_999, // rent + cost one-off
    });
  });

  it("resolves zeros for a cycle before any source starts", async () => {
    const repo = await freshHousehold();
    await repo.savings.incomeSources.replace([
      { name: "Salary", amount: 500_000, effectiveFrom: "2026-06" },
    ]);
    expect(await loadConfiguredAmounts(repo, "2026-01")).toEqual({
      monthlyIncome: 0,
      offCardFixed: 0,
    });
    expect(await loadConfiguredAmounts(repo, "2026-06")).toEqual({
      monthlyIncome: 500_000,
      offCardFixed: 0,
    });
  });

  it("returns zeros for a household with no configured amounts", async () => {
    const repo = await freshHousehold();
    expect(await loadConfiguredAmounts(repo, "2026-03")).toEqual({
      monthlyIncome: 0,
      offCardFixed: 0,
    });
  });
});
