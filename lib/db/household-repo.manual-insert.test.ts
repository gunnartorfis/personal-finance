import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

/**
 * Hand-entered Transactions (ADR-0026): `repo.transactions.createManual` inserts a first-class
 * `source = 'manual'` row (no upload / external id / source row). An optional expense type is stored
 * as an Override, which keeps the row out of the AI classification queue (no Free-cap spend) while
 * still resolving to that type; without one the row stays pending for the normal drain.
 */
describe("transactions createManual (ADR-0026)", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
  const MARCH = { from: "2026-03-01", to: "2026-04-01" };

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  async function freshHousehold() {
    const [h] = await db.insert(households).values({}).returning();
    return householdRepo(asRepoDb(db), h.id);
  }

  it("inserts a pending manual row with no upload provenance", async () => {
    const repo = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Cash" });
    const txn = await repo.transactions.createManual({
      accountId: acct.id,
      date: "2026-03-12",
      amount: -1500,
      merchant: "Cash lunch",
    });
    expect(txn.source).toBe("manual");
    expect(txn.classificationStatus).toBe("pending");
    expect(txn.uploadId).toBeNull();
    expect(txn.merchant).toBe("Cash lunch");
    // It shows up in the cycle's transactions list.
    const rows = await repo.transactions.listWithOverrides(MARCH);
    expect(rows.map((r) => r.merchant)).toContain("Cash lunch");
  });

  it("with an expense type, stores an override and stays out of the AI queue", async () => {
    const repo = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Cash" });
    const txn = await repo.transactions.createManual({
      accountId: acct.id,
      date: "2026-03-12",
      amount: -2000,
      merchant: "Hardware store",
      expenseType: "Necessary",
    });
    // The row resolves to the chosen type via its override...
    const [row] = (await repo.transactions.listWithOverrides(MARCH)).filter(
      (r) => r.id === txn.id,
    );
    expect(row.overrideType).toBe("Necessary");
    // ...and a typed row is excluded from the classification queue (overrides anti-join), so it
    // spends no Free-cap classification.
    expect(await repo.transactions.countPending()).toBe(0);
    expect((await repo.transactions.listPending()).map((r) => r.id)).not.toContain(
      txn.id,
    );
  });

  it("an untyped manual row remains pending work for the drain", async () => {
    const repo = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Cash" });
    const txn = await repo.transactions.createManual({
      accountId: acct.id,
      date: "2026-03-12",
      amount: -900,
      merchant: "Bakery",
    });
    expect(await repo.transactions.countPending()).toBe(1);
    expect((await repo.transactions.listPending()).map((r) => r.id)).toContain(
      txn.id,
    );
  });

  it("a manual row is soft-deletable (not a bank_sync row)", async () => {
    const repo = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Cash" });
    const txn = await repo.transactions.createManual({
      accountId: acct.id,
      date: "2026-03-12",
      amount: -100,
      merchant: "Coffee",
    });
    expect(await repo.transactions.softDelete(txn.id)).toHaveLength(1);
  });
});
