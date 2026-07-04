import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { loadBalanceChecks } from "./balance-check";

describe("loadBalanceChecks", () => {
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

  async function seedAccount(repo: Awaited<ReturnType<typeof freshHousehold>>, name: string) {
    const [account] = await repo.accounts.create({ name });
    const [up] = await repo.uploads.create({ accountId: account.id, fileName: `${name}.csv`, fileHash: name });
    return { account, uploadId: up.id };
  }

  it("matches when transactions between two snapshots explain the balance change", async () => {
    const repo = await freshHousehold();
    const { account, uploadId } = await seedAccount(repo, "Bank");
    // Opening 0 on Mar 1, then +100k salary and -30k spend within March → +70k, closing 70k on Mar 31.
    await repo.transactions.createMany([
      { accountId: account.id, uploadId, date: "2026-03-05", amount: 100_000, merchant: "SALARY", rawCategory: "", sourceRow: 0 },
      { accountId: account.id, uploadId, date: "2026-03-20", amount: -30_000, merchant: "RENT", rawCategory: "", sourceRow: 1 },
    ]);
    await repo.accounts.balances.insert({ accountId: account.id, balance: 0, asOf: new Date("2026-03-01T00:00:00Z") });
    await repo.accounts.balances.insert({ accountId: account.id, balance: 70_000, asOf: new Date("2026-03-31T00:00:00Z") });

    const checks = await loadBalanceChecks(repo);
    expect(checks).toEqual([
      { accountId: account.id, name: "Bank", check: { expected: 70_000, derived: 70_000, drift: 0, matches: true } },
    ]);
  });

  it("flags a drift when a transaction is missing", async () => {
    const repo = await freshHousehold();
    const { account, uploadId } = await seedAccount(repo, "Bank");
    // Only -30k recorded, but the statement says the balance fell by 50k → 20k missing.
    await repo.transactions.create({ accountId: account.id, uploadId, date: "2026-03-10", amount: -30_000, merchant: "RENT", rawCategory: "", sourceRow: 0 });
    await repo.accounts.balances.insert({ accountId: account.id, balance: 0, asOf: new Date("2026-03-01T00:00:00Z") });
    await repo.accounts.balances.insert({ accountId: account.id, balance: -50_000, asOf: new Date("2026-03-31T00:00:00Z") });

    const [result] = await loadBalanceChecks(repo);
    expect(result.check).toMatchObject({ expected: -50_000, derived: -30_000, drift: -20_000, matches: false });
  });

  it("skips accounts with fewer than two snapshots", async () => {
    const repo = await freshHousehold();
    const { account } = await seedAccount(repo, "Bank");
    await repo.accounts.balances.insert({ accountId: account.id, balance: 10_000, asOf: new Date("2026-03-01T00:00:00Z") });
    expect(await loadBalanceChecks(repo)).toEqual([]);
  });
});
