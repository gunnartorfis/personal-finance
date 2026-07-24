import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households, uploads } from "@/lib/db/schema";

/**
 * ADR-0024: a row whose Upload was undone carries `archived = true`. It is RETAINED (append-only)
 * but must be HIDDEN from the transactions list and every calculation — a stronger hide than
 * `excluded` (which keeps rows visible). It STILL counts toward the Free cap and is STILL returned
 * by the raw export read. These tests pin that read behavior through the repo's public methods.
 */
describe("transactions archived (ADR-0024)", () => {
  let db: ReturnType<typeof drizzle>;
  const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
  // March window used by every range-scoped read; contains only the core active/archived pair.
  const MARCH = { from: "2026-03-01", to: "2026-04-01" };

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  async function freshHousehold() {
    const [h] = await db.insert(households).values({}).returning();
    return householdRepo(asRepoDb(db), h.id);
  }

  /**
   * Seed one household with, for a single account/cycle, two otherwise-identical CLASSIFIED debits —
   * one active, one archived — plus the extra rows each assertion needs:
   *  - a pending active + pending archived pair (countPending),
   *  - an archived-only account in its own month (cycleMonths / accountIdsWithTransactions).
   * The core pair are classified below the review ceiling so they qualify for the review queue.
   */
  async function seed() {
    const repo = await freshHousehold();
    const [main] = await repo.accounts.create({ name: "Main" });
    const [pendingAcct] = await repo.accounts.create({ name: "Pending" });
    const [archivedOnly] = await repo.accounts.create({ name: "ArchivedOnly" });
    // One upload suffices for the household; a transaction's uploadId only needs the same household.
    const [up] = await repo.uploads.create({
      accountId: main.id,
      fileName: "a.csv",
      fileHash: "arch",
    });
    const base = { uploadId: up.id, rawCategory: "" };
    const rows = await repo.transactions.createMany([
      // Core pair — Main, March. Identical but for merchant + archived.
      {
        ...base,
        accountId: main.id,
        date: "2026-03-15",
        amount: -1000,
        merchant: "ACTIVE",
        sourceRow: 0,
        classificationStatus: "classified",
        expenseType: "Necessary",
        confidence: 0.4,
        archived: false,
      },
      {
        ...base,
        accountId: main.id,
        date: "2026-03-15",
        amount: -1000,
        merchant: "ARCHIVED",
        sourceRow: 1,
        classificationStatus: "classified",
        expenseType: "Necessary",
        confidence: 0.4,
        archived: true,
      },
      // Pending pair — Pending account, June (outside MARCH so it never touches the range reads).
      {
        ...base,
        accountId: pendingAcct.id,
        date: "2026-06-10",
        amount: -3000,
        merchant: "PEND-ACT",
        sourceRow: 2,
        classificationStatus: "pending",
        archived: false,
      },
      {
        ...base,
        accountId: pendingAcct.id,
        date: "2026-06-11",
        amount: -3000,
        merchant: "PEND-ARCH",
        sourceRow: 3,
        classificationStatus: "pending",
        archived: true,
      },
      // Archived-only account + month — its account and month must vanish from the "has data" reads.
      {
        ...base,
        accountId: archivedOnly.id,
        date: "2026-05-10",
        amount: -500,
        merchant: "ARCH-ONLY",
        sourceRow: 4,
        classificationStatus: "classified",
        expenseType: "Necessary",
        confidence: 0.4,
        archived: true,
      },
    ]);
    return {
      repo,
      main,
      pendingAcct,
      archivedOnly,
      active: rows[0],
      archived: rows[1],
      pendingActive: rows[2],
      pendingArchived: rows[3],
      archivedOnlyRow: rows[4],
    };
  }

  it("listWithOverrides hides the archived row, keeps the active one", async () => {
    const { repo } = await seed();
    const rows = await repo.transactions.listWithOverrides(MARCH);
    expect(rows.map((r) => r.merchant)).toEqual(["ACTIVE"]);
  });

  it("summaryRows drops the archived row", async () => {
    const { repo } = await seed();
    const rows = await repo.transactions.summaryRows(MARCH);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-1000);
  });

  it("monthlySpendSeries excludes the archived row's spend", async () => {
    const { repo } = await seed();
    // Only the active -1000 debit counts; the archived twin would double it to 2000.
    expect(await repo.transactions.monthlySpendSeries(MARCH)).toEqual([
      { month: "2026-03", spending: 1000, income: 0 },
    ]);
  });

  it("topMerchants excludes the archived merchant", async () => {
    const { repo } = await seed();
    expect(await repo.transactions.topMerchants(MARCH)).toEqual([
      { merchant: "ACTIVE", spending: 1000 },
    ]);
  });

  it("spendByAccount omits the archived row from the account total", async () => {
    const { repo, main } = await seed();
    expect(await repo.transactions.spendByAccount(MARCH)).toEqual([
      { accountId: main.id, name: "Main", spending: 1000 },
    ]);
  });

  it("netByAccount omits the archived row from the account net", async () => {
    const { repo, main } = await seed();
    // Raw signed sum for Main: only the active -1000; the archived twin would take it to -2000.
    expect(await repo.transactions.netByAccount(MARCH)).toEqual([
      { accountId: main.id, name: "Main", net: -1000 },
    ]);
  });

  it("reviewQueue surfaces the active row but never an archived one", async () => {
    const { repo, active, archived, pendingArchived } = await seed();
    const ids = (await repo.transactions.reviewQueue()).map((r) => r.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(archived.id);
    expect(ids).not.toContain(pendingArchived.id);
  });

  it("countPending ignores an archived pending row", async () => {
    const { repo } = await seed();
    // One active pending row is counted; the archived pending twin is not (else this would be 2).
    expect(await repo.transactions.countPending()).toBe(1);
  });

  it("cycleMonths omits a month that has only archived rows", async () => {
    const { repo } = await seed();
    const months = await repo.transactions.cycleMonths();
    expect(months).toContain("2026-03");
    expect(months).not.toContain("2026-05");
  });

  it("accountIdsWithTransactions omits an account with only archived rows", async () => {
    const { repo, main, pendingAcct, archivedOnly } = await seed();
    const ids = await repo.transactions.accountIdsWithTransactions();
    expect(ids).toContain(main.id);
    expect(ids).toContain(pendingAcct.id);
    expect(ids).not.toContain(archivedOnly.id);
  });

  it("countClassified still counts archived rows (Free cap unaffected)", async () => {
    const { repo } = await seed();
    // active + archived + archived-only, all classified — archived rows still count.
    expect(await repo.transactions.countClassified()).toBe(3);
  });

  it("raw list() still returns archived rows (retained, append-only)", async () => {
    const { repo, archived, pendingArchived, archivedOnlyRow } = await seed();
    const all = await repo.transactions.list();
    expect(all).toHaveLength(5);
    const ids = all.map((r) => r.id);
    expect(ids).toContain(archived.id);
    expect(ids).toContain(pendingArchived.id);
    expect(ids).toContain(archivedOnlyRow.id);
  });

  it("findByFileHash ignores an undone upload so its file re-imports cleanly (ADR-0024)", async () => {
    const repo = await freshHousehold();
    const [acct] = await repo.accounts.create({ name: "Main" });
    const [up] = await repo.uploads.create({
      accountId: acct.id,
      fileName: "mar.csv",
      fileHash: "reimportable",
    });
    expect((await repo.uploads.findByFileHash("reimportable"))?.id).toBe(up.id);
    // Undo it: the exact-file guard must no longer treat this hash as a duplicate.
    await db
      .update(uploads)
      .set({ undoneAt: new Date("2026-07-24T00:00:00Z") })
      .where(eq(uploads.id, up.id));
    expect(await repo.uploads.findByFileHash("reimportable")).toBeUndefined();
  });
});
