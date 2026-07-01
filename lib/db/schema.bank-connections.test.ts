import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { accounts, bankConnections, households, transactions, uploads } from "./schema";

function freshDb() {
  return drizzle(new PGlite(), {
    schema: { households, accounts, uploads, transactions, bankConnections },
  });
}

describe("bank connections & ingestion-source schema (open-banking)", () => {
  let db: ReturnType<typeof freshDb>;
  let householdId: string;
  let accountId: string;
  let connectionId: string;

  beforeAll(async () => {
    db = freshDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [hh] = await db.insert(households).values({}).returning();
    householdId = hh.id;
    const [conn] = await db
      .insert(bankConnections)
      .values({ householdId, provider: "enable_banking", providerConnectionId: "consent_1" })
      .returning();
    connectionId = conn.id;
    const [acct] = await db
      .insert(accounts)
      .values({ householdId, name: "Debit", connectionId, externalAccountId: "acc_ext_1" })
      .returning();
    accountId = acct.id;
  });

  it("defaults a new connection to active", async () => {
    const [c] = await db
      .insert(bankConnections)
      .values({ householdId, provider: "enable_banking", providerConnectionId: "consent_active" })
      .returning();
    expect(c.status).toBe("active");
  });

  it("rejects a duplicate (provider, consent) within a household", async () => {
    await db
      .insert(bankConnections)
      .values({ householdId, provider: "enable_banking", providerConnectionId: "dup" });
    await expect(
      db
        .insert(bankConnections)
        .values({ householdId, provider: "enable_banking", providerConnectionId: "dup" }),
    ).rejects.toThrow();
  });

  it("rejects an account linked to a connection from another household (composite FK)", async () => {
    const [h2] = await db.insert(households).values({}).returning();
    await expect(
      db.insert(accounts).values({ householdId: h2.id, name: "X", connectionId }),
    ).rejects.toThrow();
  });

  const syncedTxn = () => ({
    householdId,
    accountId,
    source: "bank_sync" as const,
    externalId: "tx_1",
    date: "2026-03-01",
    amount: -1990,
    merchant: "NETFLIX",
    rawCategory: "",
  });

  it("accepts a synced transaction with an external id and no upload", async () => {
    const [t] = await db.insert(transactions).values(syncedTxn()).returning();
    expect(t.source).toBe("bank_sync");
    expect(t.uploadId).toBeNull();
    expect(t.sourceRow).toBeNull();
  });

  it("rejects a synced transaction without an external id (provenance CHECK)", async () => {
    await expect(
      db.insert(transactions).values({ ...syncedTxn(), externalId: null }),
    ).rejects.toThrow();
  });

  it("rejects a synced transaction that also carries an upload id (provenance CHECK)", async () => {
    const [u] = await db
      .insert(uploads)
      .values({ householdId, accountId, fileName: "f.csv", fileHash: "prov" })
      .returning();
    await expect(
      db.insert(transactions).values({ ...syncedTxn(), externalId: "tx_up", uploadId: u.id }),
    ).rejects.toThrow();
  });

  it("rejects a csv transaction that carries an external id (provenance CHECK)", async () => {
    const [u] = await db
      .insert(uploads)
      .values({ householdId, accountId, fileName: "c.csv", fileHash: "csv-ext" })
      .returning();
    await expect(
      db.insert(transactions).values({
        householdId,
        accountId,
        uploadId: u.id,
        source: "csv",
        externalId: "should_not_be_here",
        date: "2026-03-01",
        amount: -100,
        merchant: "X",
        rawCategory: "",
        sourceRow: 0,
      }),
    ).rejects.toThrow();
  });

  it("rejects a synced transaction that carries a source row (must be null)", async () => {
    await expect(
      db.insert(transactions).values({ ...syncedTxn(), externalId: "tx_sr", sourceRow: 5 }),
    ).rejects.toThrow();
  });

  it("rejects a csv transaction without a source row (traceability CHECK)", async () => {
    const [u] = await db
      .insert(uploads)
      .values({ householdId, accountId, fileName: "nr.csv", fileHash: "no-row" })
      .returning();
    await expect(
      db.insert(transactions).values({
        householdId,
        accountId,
        uploadId: u.id,
        source: "csv",
        date: "2026-03-01",
        amount: -10,
        merchant: "X",
        rawCategory: "",
        // sourceRow omitted -> null -> rejected by the provenance CHECK
      }),
    ).rejects.toThrow();
  });

  it("dedups synced rows on (household, account, external id) but not csv rows", async () => {
    await db.insert(transactions).values({ ...syncedTxn(), externalId: "tx_dupe" });
    await expect(
      db.insert(transactions).values({ ...syncedTxn(), externalId: "tx_dupe" }),
    ).rejects.toThrow();

    // CSV rows carry a null external id, so the partial unique index never collides.
    const [u] = await db
      .insert(uploads)
      .values({ householdId, accountId, fileName: "d.csv", fileHash: "dedupe-csv" })
      .returning();
    const csvRow = {
      householdId,
      accountId,
      uploadId: u.id,
      source: "csv" as const,
      date: "2026-03-02",
      amount: -50,
      merchant: "BUS",
      rawCategory: "",
      sourceRow: 0,
    };
    await db.insert(transactions).values(csvRow);
    await db.insert(transactions).values({ ...csvRow, sourceRow: 1 });
    // both inserts succeed (no throw)
  });
});
