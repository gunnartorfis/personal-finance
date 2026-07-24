import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households, members } from "@/lib/db/schema";

/**
 * ADR-0024 (slice 4): restoring an undone Upload is the inverse of undo — it un-archives every one
 * of the Upload's Transactions (bringing them back into the list and every calculation) and clears
 * the undo timestamp/actor. It is GUARDED: if the same file has since been re-imported into a new
 * active Upload (clean-slate, ADR-0024), restoring would duplicate the rows, so it is withdrawn and
 * reports `superseded` without touching anything. These tests pin that contract through the repo's
 * public methods.
 */
describe("uploads.restore (ADR-0024)", () => {
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

  it("un-archives every row and clears the undo stamp, bringing the rows back into reads", async () => {
    const { repo, memberId } = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Main" });
    const [up] = await repo.uploads.create({
      accountId: acct.id,
      fileName: "a.csv",
      fileHash: "restore-basic",
    });
    const base = { accountId: acct.id, uploadId: up.id, rawCategory: "" };
    await repo.transactions.createMany([
      { ...base, date: "2026-03-10", amount: -1000, merchant: "A", sourceRow: 0 },
      { ...base, date: "2026-03-11", amount: -2000, merchant: "B", sourceRow: 1 },
    ]);

    // Undo hides both rows and stamps the upload.
    const undo = await repo.uploads.undo(up.id, memberId);
    expect(undo).toMatchObject({ status: "undone", archived: 2 });
    expect(await repo.transactions.listWithOverrides(MARCH)).toHaveLength(0);

    // Restore brings them back and clears the stamp.
    const result = await repo.uploads.restore(up.id);
    expect(result).toMatchObject({ status: "restored", restored: 2 });
    if (result.status === "restored") {
      expect(result.upload.undoneAt).toBeNull();
      expect(result.upload.undoneByMemberId).toBeNull();
    }

    // Both rows are visible again and no longer archived.
    expect(await repo.transactions.listWithOverrides(MARCH)).toHaveLength(2);
    const all = await repo.transactions.list();
    expect(all).toHaveLength(2);
    expect(all.every((r) => !r.archived)).toBe(true);
    // The upload row itself is active again.
    expect((await repo.uploads.findById(up.id))?.undoneAt).toBeNull();
  });

  it("is withdrawn (superseded) once the same file was re-imported, without un-archiving anything", async () => {
    const { repo, memberId } = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Main" });
    const [up] = await repo.uploads.create({
      accountId: acct.id,
      fileName: "a.csv",
      fileHash: "dup",
    });
    const base = { accountId: acct.id, uploadId: up.id, rawCategory: "" };
    await repo.transactions.createMany([
      { ...base, date: "2026-03-10", amount: -1000, merchant: "A", sourceRow: 0 },
      { ...base, date: "2026-03-11", amount: -2000, merchant: "B", sourceRow: 1 },
    ]);
    await repo.uploads.undo(up.id, memberId);

    // Clean-slate re-import: the freed file goes into a NEW active upload with the same hash.
    const [reimport] = await repo.uploads.create({
      accountId: acct.id,
      fileName: "a.csv",
      fileHash: "dup",
    });
    const rebase = { accountId: acct.id, uploadId: reimport.id, rawCategory: "" };
    await repo.transactions.createMany([
      { ...rebase, date: "2026-03-10", amount: -1000, merchant: "A", sourceRow: 0 },
      { ...rebase, date: "2026-03-11", amount: -2000, merchant: "B", sourceRow: 1 },
    ]);

    // Restoring the original would duplicate the now-live rows, so it's withdrawn.
    const result = await repo.uploads.restore(up.id);
    expect(result).toMatchObject({ status: "superseded", restored: 0 });

    // The original rows stay archived; the re-imported rows stay active. No duplicate is visible.
    const all = await repo.transactions.list();
    const originals = all.filter((r) => r.uploadId === up.id);
    const reimported = all.filter((r) => r.uploadId === reimport.id);
    expect(originals).toHaveLength(2);
    expect(originals.every((r) => r.archived)).toBe(true);
    expect(reimported).toHaveLength(2);
    expect(reimported.every((r) => !r.archived)).toBe(true);
    expect(await repo.transactions.listWithOverrides(MARCH)).toHaveLength(2);
    // The original upload is left undone.
    expect((await repo.uploads.findById(up.id))?.undoneAt).toBeInstanceOf(Date);
  });

  it("returns not-found for an unknown id and for another household's upload (scoping)", async () => {
    const { repo } = await freshHousehold();
    const other = await freshHousehold();
    const [acct] = await other.repo.accounts.create({ name: "Other" });
    const [otherUpload] = await other.repo.uploads.create({
      accountId: acct.id,
      fileName: "o.csv",
      fileHash: "o",
    });
    await other.repo.uploads.undo(otherUpload.id, other.memberId);

    expect(await repo.uploads.restore(crypto.randomUUID())).toEqual({ status: "not-found" });
    // Another household's undone upload is invisible through this repo — not-found, and it stays undone.
    expect(await repo.uploads.restore(otherUpload.id)).toEqual({ status: "not-found" });
    expect((await other.repo.uploads.findById(otherUpload.id))?.undoneAt).toBeInstanceOf(Date);
  });

  it("is a no-op (not-undone) for an upload that was never undone", async () => {
    const { repo } = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Main" });
    const [up] = await repo.uploads.create({
      accountId: acct.id,
      fileName: "a.csv",
      fileHash: "active",
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

    const result = await repo.uploads.restore(up.id);
    expect(result).toMatchObject({ status: "not-undone", restored: 0 });
    // The row was never archived and stays visible; nothing changed.
    expect(await repo.transactions.listWithOverrides(MARCH)).toHaveLength(1);
    expect((await repo.uploads.findById(up.id))?.undoneAt).toBeNull();
  });
});
