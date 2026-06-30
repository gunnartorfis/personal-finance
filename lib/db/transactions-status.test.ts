import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "./household-repo";
import { households } from "./schema";

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

/** A household with one account/upload and a single pending transaction; returns repo + txn id. */
async function pendingTxn() {
  const [hh] = await db.insert(households).values({}).returning();
  const repo = householdRepo(asDb(db), hh.id);
  const [account] = await repo.accounts.create({ name: "Visa" });
  const [upload] = await repo.uploads.create({
    accountId: account.id,
    fileName: "f.csv",
    fileHash: `h-${hh.id}`,
  });
  const [txn] = await repo.transactions.create({
    accountId: account.id,
    uploadId: upload.id,
    date: "2026-03-01",
    amount: -1990,
    merchant: "NETFLIX",
    rawCategory: "Afþreying",
    sourceRow: 0,
  });
  return { repo, txnId: txn.id };
}

describe("classification status model", () => {
  it("lists pending transactions as the work queue", async () => {
    const { repo, txnId } = await pendingTxn();
    const pending = await repo.transactions.listPending();
    expect(pending.map((t) => t.id)).toContain(txnId);
  });

  it("classify records the result and removes the row from the queue", async () => {
    const { repo, txnId } = await pendingTxn();
    const [updated] = await repo.transactions.classify(txnId, {
      expenseType: "Fixed",
      confidence: 0.95,
      reasoning: "named subscription",
    });
    expect(updated.classificationStatus).toBe("classified");
    expect(updated.expenseType).toBe("Fixed");
    expect(await repo.transactions.listPending()).toHaveLength(0);
  });

  it("re-classifying an already-classified row is a no-op (idempotent)", async () => {
    const { repo, txnId } = await pendingTxn();
    await repo.transactions.classify(txnId, { expenseType: "Fixed" });
    const again = await repo.transactions.classify(txnId, { expenseType: "Necessary" });
    expect(again).toHaveLength(0); // not pending anymore -> untouched
    expect((await repo.transactions.findById(txnId))?.expenseType).toBe("Fixed");
  });

  it("markFailed moves a pending row to failed and out of the queue", async () => {
    const { repo, txnId } = await pendingTxn();
    const [failed] = await repo.transactions.markFailed(txnId);
    expect(failed.classificationStatus).toBe("failed");
    expect(failed.expenseType).toBeNull();
    expect(await repo.transactions.listPending()).toHaveLength(0);
  });
});
