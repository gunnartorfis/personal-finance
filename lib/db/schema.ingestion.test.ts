import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
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

  it("rejects an upload whose account belongs to another household (composite FK)", async () => {
    const [h2] = await db.insert(households).values({}).returning();
    const [a2] = await db.insert(accounts).values({ householdId: h2.id, name: "Other" }).returning();
    await expect(
      db
        .insert(uploads)
        .values({ householdId, accountId: a2.id, fileName: "x.csv", fileHash: "cross" }),
    ).rejects.toThrow();
  });

  it("rejects re-importing the same file hash within a household (unique)", async () => {
    await db.insert(uploads).values({ householdId, accountId, fileName: "a.csv", fileHash: "dup-hash" });
    await expect(
      db.insert(uploads).values({ householdId, accountId, fileName: "b.csv", fileHash: "dup-hash" }),
    ).rejects.toThrow();
  });

  it("rejects an override on a transaction from another household (composite FK)", async () => {
    const [h2] = await db.insert(households).values({}).returning();
    const [a2] = await db.insert(accounts).values({ householdId: h2.id, name: "Other" }).returning();
    const [u2] = await db
      .insert(uploads)
      .values({ householdId: h2.id, accountId: a2.id, fileName: "o.csv", fileHash: "h2" })
      .returning();
    const [t2] = await db
      .insert(transactions)
      .values({
        householdId: h2.id,
        accountId: a2.id,
        uploadId: u2.id,
        date: "2026-03-01",
        amount: -100,
        merchant: "X",
        rawCategory: "Y",
        sourceRow: 0,
      })
      .returning();
    await expect(
      db.insert(overrides).values({ householdId, transactionId: t2.id, expenseType: "Fixed" }),
    ).rejects.toThrow();
  });

  it("rejects an upload whose importer belongs to another household (composite FK)", async () => {
    const [h2] = await db.insert(households).values({}).returning();
    const [m2] = await db
      .insert(members)
      .values({ householdId: h2.id, authUserId: "other-importer" })
      .returning();
    await expect(
      db
        .insert(uploads)
        .values({ householdId, accountId, importedByMemberId: m2.id, fileName: "x.csv", fileHash: "imp" }),
    ).rejects.toThrow();
  });

  it("still cascade-deletes a household that has member-attributed rows", async () => {
    const [h] = await db.insert(households).values({}).returning();
    const [m] = await db.insert(members).values({ householdId: h.id, authUserId: "leaver" }).returning();
    const [a] = await db.insert(accounts).values({ householdId: h.id, name: "Visa" }).returning();
    const [u] = await db
      .insert(uploads)
      .values({ householdId: h.id, accountId: a.id, importedByMemberId: m.id, fileName: "f.csv", fileHash: "fh" })
      .returning();
    await db.insert(transactions).values({
      householdId: h.id,
      accountId: a.id,
      uploadId: u.id,
      date: "2026-03-01",
      amount: -100,
      merchant: "X",
      rawCategory: "Y",
      sourceRow: 0,
    });
    // Deleting the household cascades through members + uploads without an FK violation.
    await db.delete(households).where(eq(households.id, h.id));
    expect(await db.select().from(uploads).where(eq(uploads.householdId, h.id))).toHaveLength(0);
  });
});
