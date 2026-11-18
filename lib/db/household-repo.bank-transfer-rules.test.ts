import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";
import { knownCounterparties } from "@/lib/open-banking/account-identity";

it("enriches legacy transfers, previews past matches, and keeps a per-deposit income override", async () => {
  const client = new PGlite();
  try {
    const database = drizzle(client);
    await migrate(database, { migrationsFolder: "./drizzle" });
    const db = database as unknown as Parameters<typeof householdRepo>[0];
    const [household, other] = await database.insert(households).values([{}, {}]).returning();
    const repo = householdRepo(db, household.id);
    const otherRepo = householdRepo(db, other.id);
    const [account] = await repo.accounts.create({ name: "Joint" });
    const [otherAccount] = await otherRepo.accounts.create({ name: "Other" });
    const matched = knownCounterparties([
      { externalId: "anchor", counterpartyIban: "GB82WEST12345698765432" },
      { externalId: "past", counterpartyIban: "gb82 west 1234 5698 7654 32" },
      { externalId: "unavailable", counterpartyIban: "GB82XXXXXXXXXXXXXXXXXX" },
    ]);
    const fingerprint = matched.get("anchor")!;
    expect(fingerprint).toBeDefined();
    expect(matched.get("past")).toBe(fingerprint);
    expect(matched.has("unavailable")).toBe(false);

    const bankRow = (accountId: string, externalId: string, amount: number, createdAt = new Date(0)) => ({
      accountId, externalId, amount, createdAt, date: "2026-03-10",
      source: "bank_sync" as const, merchant: "Same display name", rawCategory: "",
    });
    const [anchor, past, namesake] = await repo.transactions.createSyncedMany([
      bankRow(account.id, "anchor", 5000),
      bankRow(account.id, "past", -1500),
      bankRow(account.id, "namesake", -750),
    ]);
    const [unrelated] = await otherRepo.transactions.createSyncedMany([
      { ...bankRow(otherAccount.id, "anchor", -1000), counterpartyFingerprint: fingerprint },
    ]);

    await repo.transactions.fillCounterpartyFingerprints(account.id, matched);
    expect((await repo.transactions.findById(anchor.id))?.counterpartyFingerprint).toBe(fingerprint);
    expect((await repo.transactions.findById(namesake.id))?.counterpartyFingerprint).toBeNull();
    expect(await repo.bankTransferRules.preview(fingerprint, anchor.id)).toMatchObject({
      count: 1, sample: [{ id: past.id }],
    });

    await repo.bankTransferRules.save(fingerprint, anchor.id, false);
    const [future, backfilled] = await repo.transactions.createSyncedMany([
      { ...bankRow(account.id, "future", -2000, new Date("2099-01-01")), date: "2099-01-01", counterpartyFingerprint: fingerprint },
      { ...bankRow(account.id, "backfilled", -100, new Date("2099-01-01")), counterpartyFingerprint: fingerprint },
    ]);
    const range = { from: "2026-03-01", to: "2100-01-01" };
    const transferIds = async () => (await repo.transactions.listWithOverrides(range))
      .filter((row) => row.sharedTransferRuleApplies).map(({ id }) => id).sort();
    const totalsRows = async () => (await repo.transactions.summaryRows(range))
      .map(({ amount }) => amount).sort((a, b) => a - b);

    expect(await transferIds()).toEqual([anchor.id, future.id].sort());
    expect(await totalsRows()).toEqual([-1500, -750, -100]);
    expect(await repo.bankTransferRules.preview(fingerprint)).toMatchObject({ count: 2 });
    await repo.bankTransferRules.save(fingerprint, anchor.id, true);
    expect(await transferIds()).toEqual([anchor.id, past.id, future.id, backfilled.id].sort());
    expect(await totalsRows()).toEqual([-750]);
    expect((await repo.transactions.listPending()).map(({ id }) => id)).toEqual([namesake.id]);

    await repo.transactions.setIncomeMarked(anchor.id, true);
    expect(await totalsRows()).toEqual([-750, 5000]);
    await repo.transactions.setIncomeMarked(anchor.id, false);
    expect(await totalsRows()).toEqual([-750]);
    expect((await otherRepo.transactions.listWithOverrides(range)).find((row) => row.id === unrelated.id)
      ?.sharedTransferRuleApplies).toBe(false);

    await repo.bankTransferRules.remove(fingerprint);
    expect(await totalsRows()).toEqual([-2000, -1500, -750, -100, 5000]);
  } finally {
    await client.close();
  }
});
