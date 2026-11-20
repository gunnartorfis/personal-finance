import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdContext } from "./context";

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof householdContext>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("householdContext", () => {
  it("provisions a household with a default account and a repo scoped to it", async () => {
    const ctx = await householdContext(asDb(db), "ctx_user_1");
    // Provisioning seeds exactly one default account.
    const seeded = await ctx.repo.accounts.list();
    expect(seeded).toHaveLength(1);
    expect(seeded[0].isDefault).toBe(true);

    const [account] = await ctx.repo.accounts.create({ name: "Visa" });
    expect(account.householdId).toBe(ctx.householdId);
    expect(account.isDefault).toBe(false);
    expect(await ctx.repo.accounts.list()).toHaveLength(2);
  });

  it("isolates one user's data from another's", async () => {
    const a = await householdContext(asDb(db), "ctx_user_2");
    const b = await householdContext(asDb(db), "ctx_user_3");
    await a.repo.accounts.create({ name: "A-only" });
    // b only ever sees its own default account, never a's.
    const bAccounts = await b.repo.accounts.list();
    expect(bAccounts).toHaveLength(1);
    expect(bAccounts.some((acc) => acc.name === "A-only")).toBe(false);
  });

  it("returns the same household for the same user across requests", async () => {
    const first = await householdContext(asDb(db), "ctx_user_4");
    const second = await householdContext(asDb(db), "ctx_user_4");
    expect(second.householdId).toBe(first.householdId);
  });

  it("recognizes historical and new credits from a household member's full name", async () => {
    const authUserId = "ctx_transfer_sender";
    const { repo } = await householdContext(asDb(db), authUserId);
    const { repo: otherRepo } = await householdContext(asDb(db), "ctx_other_sender");
    const [account] = await repo.accounts.list();
    const [otherAccount] = await otherRepo.accounts.list();
    const range = { from: "2026-10-01", to: "2026-11-01" };
    const credit = {
      source: "bank_sync" as const,
      amount: 65_000,
      date: "2026-10-14",
      merchant: "Sigrún María Jónsdóttir",
      rawCategory: "",
    };
    await repo.transactions.createSyncedMany([
      { ...credit, accountId: account.id, externalId: "older" },
    ]);
    expect(await repo.transactions.listWithOverrides(range)).toMatchObject([{ ownAccountCredit: false }]);

    await householdContext(asDb(db), authUserId, credit.merchant);
    await repo.transactions.createSyncedMany([
      { ...credit, accountId: account.id, externalId: "second", merchant: "  SIGRÚN  MARÍA JÓNSDÓTTIR ".normalize("NFD") },
      { ...credit, accountId: account.id, externalId: "debit", amount: -65_000 },
      { ...credit, accountId: account.id, externalId: "longer-label", merchant: `${credit.merchant} Refund` },
      { ...credit, accountId: account.id, externalId: "verified", counterpartyFingerprint: "other-account" },
    ]);
    await otherRepo.transactions.createSyncedMany([
      { ...credit, accountId: otherAccount.id, externalId: "other-household" },
    ]);
    const recognized = (await repo.transactions.listWithOverrides(range)).filter((row) => row.ownAccountCredit);
    expect(recognized).toHaveLength(2);
    expect(recognized.every((row) => row.amount === credit.amount)).toBe(true);
    expect(await otherRepo.transactions.listWithOverrides(range)).toMatchObject([{ ownAccountCredit: false }]);
    expect((await repo.transactions.listPending()).map((row) => row.externalId).sort())
      .toEqual(["debit", "longer-label", "verified"]);

    await repo.transactions.setIncomeMarked(recognized[0].id, true);
    expect(await repo.transactions.summaryRows(range)).toContainEqual(
      expect.objectContaining({ amount: credit.amount, incomeMarked: true }),
    );

    await householdContext(asDb(db), authUserId, null);
    expect((await repo.transactions.listWithOverrides(range)).some((row) => row.ownAccountCredit)).toBe(false);
  });

  it("exposes the household plan (defaulting to Free) for free-cap gating", async () => {
    const ctx = await householdContext(asDb(db), "ctx_user_5");
    expect(ctx.plan).toBe("Free");
  });

  it("exposes the billing currency (defaulting to ISK) for money formatting", async () => {
    const ctx = await householdContext(asDb(db), "ctx_user_6");
    expect(ctx.billingCurrency).toBe("ISK");
  });

  it("exposes the subscription fields (null on a fresh Free household)", async () => {
    const ctx = await householdContext(asDb(db), "ctx_user_7");
    expect(ctx.planRenewsAt).toBeNull();
    expect(ctx.subscriptionPeriod).toBeNull();
  });
});
