import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "./household-repo";
import { households } from "./schema";

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

// pglite's drizzle db exposes the same query surface; cast to the repo's expected db type.
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

/** Create two fresh households and a repo scoped to each. */
async function twoHouseholds() {
  const [a] = await db.insert(households).values({}).returning();
  const [b] = await db.insert(households).values({}).returning();
  return {
    a: householdRepo(asRepoDb(db), a.id),
    b: householdRepo(asRepoDb(db), b.id),
    aId: a.id,
  };
}

describe("householdRepo", () => {
  it("stamps the bound householdId on create", async () => {
    const { a, aId } = await twoHouseholds();
    const [account] = await a.accounts.create({ name: "Visa" });
    expect(account.householdId).toBe(aId);
  });

  it("scopes account lists to the bound household", async () => {
    const { a, b } = await twoHouseholds();
    await a.accounts.create({ name: "A-Visa" });
    await b.accounts.create({ name: "B-Visa" });
    const aAccounts = await a.accounts.list();
    expect(aAccounts).toHaveLength(1);
    expect(aAccounts[0].name).toBe("A-Visa");
  });

  it("scopes uploads and transactions to the bound household", async () => {
    const { a, b } = await twoHouseholds();
    const [account] = await a.accounts.create({ name: "Visa" });
    const [upload] = await a.uploads.create({
      accountId: account.id,
      fileName: "mar.csv",
      fileHash: "hash-a",
    });
    await a.transactions.create({
      accountId: account.id,
      uploadId: upload.id,
      date: "2026-03-01",
      amount: -1990,
      merchant: "NETFLIX",
      rawCategory: "Afþreying",
      sourceRow: 0,
    });
    expect(await a.transactions.list()).toHaveLength(1);
    expect(await b.transactions.list()).toHaveLength(0);
    expect(await b.uploads.list()).toHaveLength(0);
  });

  it("scopes merchant rules to the bound household", async () => {
    const { a, b } = await twoHouseholds();
    await a.merchantRules.create({ merchant: "NETFLIX", flatType: "Fixed" });
    expect(await a.merchantRules.list()).toHaveLength(1);
    expect(await b.merchantRules.list()).toHaveLength(0);
  });
});
