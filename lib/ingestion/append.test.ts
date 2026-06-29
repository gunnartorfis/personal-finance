import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { appendTransactions } from "./append";
import type { ParsedRow } from "./parse-csv";

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function freshUpload() {
  const [hh] = await db.insert(households).values({}).returning();
  const repo = householdRepo(asDb(db), hh.id);
  const [account] = await repo.accounts.create({ name: "Visa" });
  const [upload] = await repo.uploads.create({
    accountId: account.id,
    fileName: "f.csv",
    fileHash: `h-${hh.id}`,
  });
  return { repo, accountId: account.id, uploadId: upload.id };
}

const row = (sourceRow: number, amount: number, merchant: string): ParsedRow => ({
  sourceRow,
  date: "2026-03-01",
  amount,
  merchant,
  rawCategory: "Verslun",
});

describe("appendTransactions", () => {
  it("appends rows as pending transactions with their source row", async () => {
    const { repo, accountId, uploadId } = await freshUpload();
    const result = await appendTransactions(repo, {
      uploadId,
      accountId,
      rows: [row(0, -1990, "NETFLIX"), row(1, -3200, "BONUS")],
    });
    expect(result).toEqual({ appended: 2, duplicates: 0 });
    const txns = await repo.transactions.list();
    expect(txns).toHaveLength(2);
    expect(txns.every((t) => t.classificationStatus === "pending")).toBe(true);
    expect(txns.every((t) => t.expenseType === null)).toBe(true);
    expect(txns.map((t) => t.sourceRow).sort()).toEqual([0, 1]);
  });

  it("skips rows already imported on a re-upload (dedup)", async () => {
    const { repo, accountId, uploadId } = await freshUpload();
    const rows = [row(0, -1990, "NETFLIX")];
    await appendTransactions(repo, { uploadId, accountId, rows });
    const second = await appendTransactions(repo, { uploadId, accountId, rows });
    expect(second).toEqual({ appended: 0, duplicates: 1 });
    expect(await repo.transactions.list()).toHaveLength(1);
  });

  it("does not dedup identical rows across different accounts", async () => {
    const [hh] = await db.insert(households).values({}).returning();
    const repo = householdRepo(asDb(db), hh.id);
    const [acctA] = await repo.accounts.create({ name: "Visa" });
    const [acctB] = await repo.accounts.create({ name: "Mastercard" });
    const [upA] = await repo.uploads.create({ accountId: acctA.id, fileName: "a.csv", fileHash: "ha" });
    const [upB] = await repo.uploads.create({ accountId: acctB.id, fileName: "b.csv", fileHash: "hb" });
    const sameRow = [row(0, -1990, "NETFLIX")];
    await appendTransactions(repo, { uploadId: upA.id, accountId: acctA.id, rows: sameRow });
    // The same (date, amount, merchant, category) on a different account is NOT a duplicate.
    const b = await appendTransactions(repo, { uploadId: upB.id, accountId: acctB.id, rows: sameRow });
    expect(b).toEqual({ appended: 1, duplicates: 0 });
    expect(await repo.transactions.list()).toHaveLength(2);
  });

  it("keeps genuine same-day same-price repeats (occurrence ordinal)", async () => {
    const { repo, accountId, uploadId } = await freshUpload();
    const result = await appendTransactions(repo, {
      uploadId,
      accountId,
      rows: [row(0, -650, "KAFFITAR"), row(1, -650, "KAFFITAR")],
    });
    expect(result.appended).toBe(2);
  });
});
