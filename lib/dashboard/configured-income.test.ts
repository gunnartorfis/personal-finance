import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { loadConfiguredIncome, loadConfiguredIncomeByCycle } from "./configured-income";

describe("loadConfiguredIncomeByCycle", () => {
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
    expect(await loadConfiguredIncomeByCycle(repo, [])).toEqual(new Map());
  });

  it("resolves the version in force per cycle and sums independent sources", async () => {
    const repo = await freshHousehold();
    await repo.savings.incomeSources.replace([
      // A salary that gets a raise from 2026-03 on.
      { name: "Salary", amount: 500_000, effectiveFrom: "2026-01" },
      { name: "Salary", amount: 550_000, effectiveFrom: "2026-03" },
      // A separate rental income that only starts 2026-02.
      { name: "Rent", amount: 100_000, effectiveFrom: "2026-02" },
    ]);

    const byCycle = await loadConfiguredIncomeByCycle(repo, [
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(byCycle.get("2026-01")).toBe(500_000); // salary only
    expect(byCycle.get("2026-02")).toBe(600_000); // salary + rent
    expect(byCycle.get("2026-03")).toBe(650_000); // raised salary + rent
  });

  it("adds one-off income adjustments to the cycle they land on, ignoring cost one-offs", async () => {
    const repo = await freshHousehold();
    await repo.savings.incomeSources.replace([
      { name: "Salary", amount: 500_000, effectiveFrom: "2026-01" },
    ]);
    await repo.savings.oneOffAdjustments.replace([
      { cycleKey: "2026-02", kind: "income", amount: 50_000, label: "Bonus" },
      { cycleKey: "2026-02", kind: "cost", amount: 9_999, label: "One-time bill" },
    ]);

    const byCycle = await loadConfiguredIncomeByCycle(repo, ["2026-01", "2026-02"]);
    expect(byCycle.get("2026-01")).toBe(500_000);
    expect(byCycle.get("2026-02")).toBe(550_000); // salary + income one-off; cost one-off ignored
  });

  it("resolves 0 for a cycle before any source starts", async () => {
    const repo = await freshHousehold();
    await repo.savings.incomeSources.replace([
      { name: "Salary", amount: 500_000, effectiveFrom: "2026-06" },
    ]);
    expect(await loadConfiguredIncome(repo, "2026-01")).toBe(0);
    expect(await loadConfiguredIncome(repo, "2026-06")).toBe(500_000);
  });

  it("returns 0 for a household with no configured income", async () => {
    const repo = await freshHousehold();
    expect(await loadConfiguredIncome(repo, "2026-03")).toBe(0);
  });
});
