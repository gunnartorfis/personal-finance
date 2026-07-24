import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { accounts, households, members, transactions, uploads } from "./schema";

function freshDb() {
  return drizzle(new PGlite(), {
    schema: { households, members, accounts, uploads, transactions },
  });
}

/**
 * Schema support for undoing an Upload (ADR-0024): a per-row `archived` flag on transactions and
 * `undone_at` / `undone_by_member_id` on uploads, plus the exact-file guard narrowed to ACTIVE
 * uploads (partial unique WHERE undone_at IS NULL) so an undone Upload frees its file for a clean
 * re-import.
 */
describe("archive / undo schema (ADR-0024)", () => {
  let db: ReturnType<typeof freshDb>;
  let householdId: string;
  let accountId: string;
  let memberId: string;
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
    memberId = member.id;
    const [upload] = await db
      .insert(uploads)
      .values({ householdId, accountId, importedByMemberId: memberId, fileName: "mar.csv", fileHash: "seed-hash" })
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

  it("a new transaction defaults to not archived", async () => {
    const [t] = await db.insert(transactions).values(baseTxn()).returning();
    expect(t.archived).toBe(false);
  });

  it("a transaction can be archived (retained but hidden)", async () => {
    const [t] = await db
      .insert(transactions)
      .values({ ...baseTxn(), archived: true })
      .returning();
    expect(t.archived).toBe(true);
  });

  it("archived is orthogonal to excluded/income — a row may be both archived and excluded", async () => {
    const [t] = await db
      .insert(transactions)
      .values({ ...baseTxn(), archived: true, excluded: true, exclusionNote: "grandma" })
      .returning();
    expect(t.archived).toBe(true);
    expect(t.excluded).toBe(true);
  });

  it("a fresh upload is active — undone_at and undone_by are null", async () => {
    const [u] = await db
      .insert(uploads)
      .values({ householdId, accountId, fileName: "apr.csv", fileHash: "active-hash" })
      .returning();
    expect(u.undoneAt).toBeNull();
    expect(u.undoneByMemberId).toBeNull();
  });

  it("an upload records who undid it and when", async () => {
    const [u] = await db
      .insert(uploads)
      .values({ householdId, accountId, fileName: "may.csv", fileHash: "undo-hash" })
      .returning();
    const when = new Date("2026-07-24T10:00:00Z");
    const [undone] = await db
      .update(uploads)
      .set({ undoneAt: when, undoneByMemberId: memberId })
      .where(eq(uploads.id, u.id))
      .returning();
    expect(undone.undoneAt).toEqual(when);
    expect(undone.undoneByMemberId).toBe(memberId);
  });

  it("rejects an undoer Member from another household (composite FK)", async () => {
    const [h2] = await db.insert(households).values({}).returning();
    const [m2] = await db
      .insert(members)
      .values({ householdId: h2.id, authUserId: "other-undoer" })
      .returning();
    const [u] = await db
      .insert(uploads)
      .values({ householdId, accountId, fileName: "jun.csv", fileHash: "cross-undoer" })
      .returning();
    await expect(
      db.update(uploads).set({ undoneByMemberId: m2.id }).where(eq(uploads.id, u.id)),
    ).rejects.toThrow();
  });

  it("still rejects two ACTIVE uploads of the same file hash (guard intact for active)", async () => {
    await db.insert(uploads).values({ householdId, accountId, fileName: "a.csv", fileHash: "dup-active" });
    await expect(
      db.insert(uploads).values({ householdId, accountId, fileName: "b.csv", fileHash: "dup-active" }),
    ).rejects.toThrow();
  });

  it("allows re-importing a file hash once the prior upload is undone (clean-slate, ADR-0024)", async () => {
    const [first] = await db
      .insert(uploads)
      .values({ householdId, accountId, fileName: "wrong-account.csv", fileHash: "reimport-hash" })
      .returning();
    // While it is active, the same hash is blocked.
    await expect(
      db.insert(uploads).values({ householdId, accountId, fileName: "again.csv", fileHash: "reimport-hash" }),
    ).rejects.toThrow();
    // Undo the first upload; its file hash is freed.
    await db.update(uploads).set({ undoneAt: new Date("2026-07-24T11:00:00Z") }).where(eq(uploads.id, first.id));
    const [reimport] = await db
      .insert(uploads)
      .values({ householdId, accountId, fileName: "again.csv", fileHash: "reimport-hash" })
      .returning();
    expect(reimport.id).not.toBe(first.id);
    expect(reimport.undoneAt).toBeNull();
  });
});
