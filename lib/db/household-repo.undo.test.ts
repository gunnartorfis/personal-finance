import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households, members } from "@/lib/db/schema";

/**
 * ADR-0024 (slice 2): undoing an Upload archives all of its Transactions (hiding them from the list
 * and every calculation, retained for Restore), stamps the Upload with the undo timestamp/actor, and
 * unlinks any detected transfer pair so the surviving partner leg returns to its natural math
 * treatment. These tests pin that contract through the repo's public methods.
 */
describe("uploads.undo (ADR-0024)", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
  const MARCH = { from: "2026-03-01", to: "2026-04-01" };

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  /** A fresh household with one real Member (undo stamps undoneByMemberId, a same-household FK). */
  async function freshHousehold() {
    const [h] = await db.insert(households).values({}).returning();
    const [member] = await db
      .insert(members)
      .values({ householdId: h.id, authUserId: `auth-${h.id}` })
      .returning();
    return { repo: householdRepo(asRepoDb(db), h.id), memberId: member.id };
  }

  it("archives every transaction of the upload and returns the count, hiding them from reads", async () => {
    const { repo, memberId } = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Main" });
    const [up] = await repo.uploads.create({
      accountId: acct.id,
      fileName: "a.csv",
      fileHash: "a",
    });
    const base = { accountId: acct.id, uploadId: up.id, rawCategory: "" };
    await repo.transactions.createMany([
      { ...base, date: "2026-03-10", amount: -1000, merchant: "A", sourceRow: 0 },
      { ...base, date: "2026-03-11", amount: -2000, merchant: "B", sourceRow: 1 },
    ]);
    // Both rows are visible before the undo.
    expect(await repo.transactions.listWithOverrides(MARCH)).toHaveLength(2);

    const result = await repo.uploads.undo(up.id, memberId);
    expect(result).toMatchObject({ status: "undone", archived: 2 });
    // The upload row is stamped with the timestamp + actor.
    if (result.status === "undone") {
      expect(result.upload.undoneAt).toBeInstanceOf(Date);
      expect(result.upload.undoneByMemberId).toBe(memberId);
    }

    // Hidden from the list read, but RETAINED (archived=true) in the raw export read.
    expect(await repo.transactions.listWithOverrides(MARCH)).toHaveLength(0);
    const all = await repo.transactions.list();
    expect(all).toHaveLength(2);
    expect(all.every((r) => r.archived)).toBe(true);
  });

  it("unlinks BOTH transfer legs, so the surviving leg in another upload counts as spend again", async () => {
    const { repo, memberId } = await freshHousehold();
    const [bank] = await repo.accounts.create({ name: "Bank" });
    const [card] = await repo.accounts.create({ name: "Card" });
    // The debit leg lives in the upload we KEEP; the credit leg in the one we UNDO.
    const [keep] = await repo.uploads.create({
      accountId: bank.id,
      fileName: "bank.csv",
      fileHash: "keep",
    });
    const [undoable] = await repo.uploads.create({
      accountId: card.id,
      fileName: "card.csv",
      fileHash: "undoable",
    });
    const [debit] = await repo.transactions.create({
      accountId: bank.id,
      uploadId: keep.id,
      date: "2026-03-10",
      amount: -50_000,
      merchant: "CARD PAYMENT",
      rawCategory: "",
      sourceRow: 0,
      classificationStatus: "classified",
      expenseType: "Fixed",
    });
    const [credit] = await repo.transactions.create({
      accountId: card.id,
      uploadId: undoable.id,
      date: "2026-03-11",
      amount: 50_000,
      merchant: "PAYMENT RECEIVED",
      rawCategory: "",
      sourceRow: 0,
    });
    await repo.transactions.markTransferPair(debit.id, credit.id);

    // Before the undo: the pair is money movement, so neither leg counts as spend.
    expect(await repo.transactions.spendByAccount(MARCH)).toEqual([]);
    expect(await repo.transactions.summaryRows(MARCH)).toHaveLength(0);

    const result = await repo.uploads.undo(undoable.id, memberId);
    expect(result).toMatchObject({ status: "undone", archived: 1 });

    // Both legs lost their transfer group; the surviving debit is un-archived and spends again.
    expect((await repo.transactions.findById(debit.id))?.transferGroupId).toBeNull();
    expect((await repo.transactions.findById(debit.id))?.archived).toBe(false);
    expect((await repo.transactions.findById(credit.id))?.transferGroupId).toBeNull();
    expect((await repo.transactions.findById(credit.id))?.archived).toBe(true);

    expect(await repo.transactions.spendByAccount(MARCH)).toEqual([
      { accountId: bank.id, name: "Bank", spending: 50_000 },
    ]);
    const summary = await repo.transactions.summaryRows(MARCH);
    expect(summary).toHaveLength(1);
    expect(summary[0].amount).toBe(-50_000);
  });

  it("is idempotent: a second undo is a no-op that keeps the rows archived", async () => {
    const { repo, memberId } = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Main" });
    const [up] = await repo.uploads.create({
      accountId: acct.id,
      fileName: "a.csv",
      fileHash: "idem",
    });
    await repo.transactions.create({
      accountId: acct.id,
      uploadId: up.id,
      date: "2026-03-10",
      amount: -1000,
      merchant: "A",
      rawCategory: "",
      sourceRow: 0,
    });

    const first = await repo.uploads.undo(up.id, memberId);
    expect(first).toMatchObject({ status: "undone", archived: 1 });

    // A second undo re-archives nothing (archived: 0) and reports the already-undone state.
    const second = await repo.uploads.undo(up.id, memberId);
    expect(second).toMatchObject({ status: "already-undone", archived: 0 });

    // The row stays archived, not flipped back.
    expect((await repo.transactions.list()).every((r) => r.archived)).toBe(true);
  });

  it("returns not-found for an unknown id and for another household's upload (scoping)", async () => {
    const { repo, memberId } = await freshHousehold();
    const other = await freshHousehold();
    const [acct] = await other.repo.accounts.create({ name: "Other" });
    const [otherUpload] = await other.repo.uploads.create({
      accountId: acct.id,
      fileName: "o.csv",
      fileHash: "o",
    });

    expect(await repo.uploads.undo(crypto.randomUUID(), memberId)).toEqual({ status: "not-found" });
    // Another household's upload id is invisible through this repo — not-found, and it stays active.
    expect(await repo.uploads.undo(otherUpload.id, memberId)).toEqual({ status: "not-found" });
    expect((await other.repo.uploads.findById(otherUpload.id))?.undoneAt).toBeNull();
  });
});
