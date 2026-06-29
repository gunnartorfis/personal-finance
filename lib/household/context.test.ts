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
  it("provisions a household and returns a repo scoped to it", async () => {
    const ctx = await householdContext(asDb(db), "ctx_user_1");
    const [account] = await ctx.repo.accounts.create({ name: "Visa" });
    expect(account.householdId).toBe(ctx.householdId);
    expect(await ctx.repo.accounts.list()).toHaveLength(1);
  });

  it("isolates one user's data from another's", async () => {
    const a = await householdContext(asDb(db), "ctx_user_2");
    const b = await householdContext(asDb(db), "ctx_user_3");
    await a.repo.accounts.create({ name: "A-only" });
    expect(await b.repo.accounts.list()).toHaveLength(0);
  });

  it("returns the same household for the same user across requests", async () => {
    const first = await householdContext(asDb(db), "ctx_user_4");
    const second = await householdContext(asDb(db), "ctx_user_4");
    expect(second.householdId).toBe(first.householdId);
  });
});
