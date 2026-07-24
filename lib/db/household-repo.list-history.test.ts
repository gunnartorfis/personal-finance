import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households, members } from "@/lib/db/schema";

/**
 * ADR-0024 (slice 5): `uploads.listHistory` is the read that backs the /upload history UI. It returns
 * every Upload for the Household newest-first with its Account name, the number of Transactions it
 * brought in (archived or not — a correlated count), the created/undone timestamps, and
 * `supersededByReimport`: true when an undone Upload's file has since been re-imported into a new
 * active Upload, mirroring `restore()`'s guard so the UI can withdraw Restore. Member names are NOT
 * resolved in SQL — the ids come back and the page maps them. These tests pin that contract.
 */
describe("uploads.listHistory (ADR-0024)", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

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

  it("returns uploads newest-first with account name, ids, count, and undo state", async () => {
    const { repo, memberId } = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Main" });

    // Older Upload: active, two Transactions.
    const [older] = await repo.uploads.create({
      accountId: acct.id,
      importedByMemberId: memberId,
      fileName: "old.csv",
      fileHash: "old",
      createdAt: new Date("2026-03-01T00:00:00Z"),
    });
    await repo.transactions.createMany([
      { accountId: acct.id, uploadId: older.id, rawCategory: "", date: "2026-03-10", amount: -1000, merchant: "A", sourceRow: 0 },
      { accountId: acct.id, uploadId: older.id, rawCategory: "", date: "2026-03-11", amount: -2000, merchant: "B", sourceRow: 1 },
    ]);

    // Newer Upload: one Transaction, then undone.
    const [newer] = await repo.uploads.create({
      accountId: acct.id,
      importedByMemberId: memberId,
      fileName: "new.csv",
      fileHash: "new",
      createdAt: new Date("2026-03-02T00:00:00Z"),
    });
    await repo.transactions.create({
      accountId: acct.id, uploadId: newer.id, rawCategory: "", date: "2026-03-12", amount: -3000, merchant: "C", sourceRow: 0,
    });
    await repo.uploads.undo(newer.id, memberId);

    const history = await repo.uploads.listHistory();
    expect(history).toHaveLength(2);
    // Newest first.
    expect(history.map((h) => h.id)).toEqual([newer.id, older.id]);

    const [first, second] = history;
    expect(first).toMatchObject({
      id: newer.id,
      fileName: "new.csv",
      accountId: acct.id,
      accountName: "Main",
      importedByMemberId: memberId,
      undoneByMemberId: memberId,
      transactionCount: 1,
      supersededByReimport: false,
    });
    expect(first.createdAt).toBeInstanceOf(Date);
    expect(first.undoneAt).toBeInstanceOf(Date);

    expect(second).toMatchObject({
      id: older.id,
      fileName: "old.csv",
      accountName: "Main",
      importedByMemberId: memberId,
      undoneByMemberId: null,
      transactionCount: 2,
      supersededByReimport: false,
    });
    expect(second.undoneAt).toBeNull();
  });

  it("counts archived rows too — an undone upload keeps its full transaction count", async () => {
    const { repo, memberId } = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Main" });
    const [up] = await repo.uploads.create({ accountId: acct.id, fileName: "a.csv", fileHash: "count" });
    await repo.transactions.createMany([
      { accountId: acct.id, uploadId: up.id, rawCategory: "", date: "2026-03-10", amount: -1000, merchant: "A", sourceRow: 0 },
      { accountId: acct.id, uploadId: up.id, rawCategory: "", date: "2026-03-11", amount: -2000, merchant: "B", sourceRow: 1 },
      { accountId: acct.id, uploadId: up.id, rawCategory: "", date: "2026-03-12", amount: -3000, merchant: "C", sourceRow: 2 },
    ]);
    await repo.uploads.undo(up.id, memberId);

    const [row] = await repo.uploads.listHistory();
    // Every row is archived now, but the count reflects everything the Upload brought in.
    expect(row.transactionCount).toBe(3);
    expect(row.undoneAt).toBeInstanceOf(Date);
  });

  it("supersededByReimport flips true once the undone file is re-imported into a new active upload", async () => {
    const { repo, memberId } = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Main" });
    const [up] = await repo.uploads.create({
      accountId: acct.id, fileName: "a.csv", fileHash: "dup",
      createdAt: new Date("2026-03-01T00:00:00Z"),
    });
    await repo.transactions.create({
      accountId: acct.id, uploadId: up.id, rawCategory: "", date: "2026-03-10", amount: -1000, merchant: "A", sourceRow: 0,
    });
    await repo.uploads.undo(up.id, memberId);

    // Still restorable while no ACTIVE Upload shares the file hash.
    const before = await repo.uploads.listHistory();
    expect(before.find((h) => h.id === up.id)?.supersededByReimport).toBe(false);

    // Clean-slate re-import: same file hash, new active Upload.
    const [reimport] = await repo.uploads.create({
      accountId: acct.id, fileName: "a.csv", fileHash: "dup",
      createdAt: new Date("2026-03-02T00:00:00Z"),
    });
    await repo.transactions.create({
      accountId: acct.id, uploadId: reimport.id, rawCategory: "", date: "2026-03-10", amount: -1000, merchant: "A", sourceRow: 0,
    });

    const after = await repo.uploads.listHistory();
    // The original undone Upload can no longer be restored (mirrors restore()'s superseded guard).
    expect(after.find((h) => h.id === up.id)?.supersededByReimport).toBe(true);
    // The active re-import is not itself superseded — only an undone Upload ever is.
    expect(after.find((h) => h.id === reimport.id)?.supersededByReimport).toBe(false);
  });

  it("scopes to the household — another household's uploads never appear", async () => {
    const { repo } = await freshHousehold();
    const other = await freshHousehold();
    const [acct] = await other.repo.accounts.create({ name: "Other" });
    await other.repo.uploads.create({ accountId: acct.id, fileName: "o.csv", fileHash: "other" });

    expect(await repo.uploads.listHistory()).toEqual([]);
    expect(await other.repo.uploads.listHistory()).toHaveLength(1);
  });
});
