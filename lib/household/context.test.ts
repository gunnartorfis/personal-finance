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
