import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { accounts, households, members, overrides, transactions, uploads } from "./schema";

function freshDb() {
  return drizzle(new PGlite(), {
    schema: { households, members, accounts, uploads, transactions, overrides },
  });
}

describe("ingestion & classification schema", () => {
  let db: ReturnType<typeof freshDb>;
  let householdId: string;
  let accountId: string;
  let uploadId: string;

  beforeAll(async () => {
    db = freshDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [hh] = await db.insert(households).values({}).returning();
    householdId = hh.id;
    const [acct] = await db.insert(accounts).values({ householdId, name: "Visa" }).returning();
    accountId = acct.id;
    const [member] = await db
      .insert(members)
      .values({ householdId, authUserId: `u_${householdId}` })
      .returning();
    const [upload] = await db
      .insert(uploads)
      .values({ householdId, accountId, importedByMemberId: member.id, fileName: "mar.csv", fileHash: "abc123" })
      .returning();
    uploadId = upload.id;
  });

  const baseTxn = () => ({
    householdId,
    accountId,
    uploadId,
    date: "2026-03-01",
    amount: -1990,
    merchant: "NETFLIX",
    rawCategory: "Afþreying",
    sourceRow: 0,
  });

  it("a new transaction defaults to pending with no expense type", async () => {
    const [t] = await db.insert(transactions).values(baseTxn()).returning();
    expect(t.classificationStatus).toBe("pending");
    expect(t.expenseType).toBeNull();
  });

  it("accepts a classified transaction with the empty (not-bucketed) type", async () => {
    const [t] = await db
      .insert(transactions)
      .values({ ...baseTxn(), classificationStatus: "classified", expenseType: "" })
      .returning();
    expect(t.expenseType).toBe("");
  });

  it("rejects a classified transaction without an expense type", async () => {
    await expect(
      db.insert(transactions).values({ ...baseTxn(), classificationStatus: "classified" }),
    ).rejects.toThrow();
  });

  it("rejects a pending transaction that already has an expense type", async () => {
    await expect(
      db.insert(transactions).values({ ...baseTxn(), expenseType: "Fixed" }),
    ).rejects.toThrow();
  });

  it("rejects an invalid expense type", async () => {
    await expect(
      db
        .insert(transactions)
        .values({ ...baseTxn(), classificationStatus: "classified", expenseType: "Luxury" }),
    ).rejects.toThrow();
  });

  it("requires original amount and currency together", async () => {
    await expect(
      db.insert(transactions).values({ ...baseTxn(), originalAmount: "-10.21" }),
    ).rejects.toThrow();
    const [ok] = await db
      .insert(transactions)
      .values({ ...baseTxn(), originalAmount: "-10.21", originalCurrency: "USD" })
      .returning();
    expect(ok.originalCurrency).toBe("USD");
  });

  it("rejects a transaction whose upload does not exist (FK)", async () => {
    await expect(
      db
        .insert(transactions)
        .values({ ...baseTxn(), uploadId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow();
  });

  it("allows one override per transaction and rejects a second", async () => {
    const [t] = await db.insert(transactions).values(baseTxn()).returning();
    await db.insert(overrides).values({ householdId, transactionId: t.id, expenseType: "Necessary" });
    await expect(
      db.insert(overrides).values({ householdId, transactionId: t.id, expenseType: "Fixed" }),
    ).rejects.toThrow();
  });
});
