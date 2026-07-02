import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { performCheckin } from "./checkin";

let db: ReturnType<typeof drizzle>;
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function freshHousehold() {
  const [h] = await db.insert(households).values({}).returning();
  return householdRepo(asRepoDb(db), h.id);
}

/** Mid-July 2026: the current cycle is 2026-07; completed trailing cycles are Apr–Jun. */
const NOW = new Date("2026-07-15T12:00:00Z");

async function seedGoalAndConfig(repo: Awaited<ReturnType<typeof freshHousehold>>) {
  await repo.savings.goal.upsert({
    target: 1_200_000,
    targetDate: "2027-05-31",
    startingSaved: 0,
    startCycle: "2026-06", // 12 cycles: 2026-06 .. 2027-05
    currency: "ISK",
  });
  await repo.savings.replaceConfig(
    [{ name: "Salary", amount: 1_000_000 }],
    [{ name: "Mortgage", monthlyAmount: 300_000 }],
  );
}

async function seedExpense(
  repo: Awaited<ReturnType<typeof freshHousehold>>,
  base: { accountId: string; uploadId: string },
  date: string,
  amount: number,
  expenseType: "Fixed" | "Necessary" | "Nice to have" | null,
  sourceRow: number,
) {
  const [txn] = await repo.transactions.create({
    ...base,
    date,
    amount,
    merchant: "M",
    rawCategory: "",
    sourceRow,
  });
  if (expenseType !== null) {
    await repo.transactions.classify(txn.id, { expenseType });
  }
  return txn;
}

async function seedAccount(repo: Awaited<ReturnType<typeof freshHousehold>>, tag: string) {
  const [account] = await repo.accounts.create({ name: "Visa" });
  const [upload] = await repo.uploads.create({
    accountId: account.id,
    fileName: "f.csv",
    fileHash: tag,
  });
  return { accountId: account.id, uploadId: upload.id };
}

describe("performCheckin", () => {
  it("freezes the current cycle from config + net summary and assesses the goal", async () => {
    const repo = await freshHousehold();
    await seedGoalAndConfig(repo);
    const base = await seedAccount(repo, "ci-1");

    // June (already checked in): feeds cumulative via its frozen row, and the estimator via txns.
    await repo.savings.checkins.upsertByCycle({
      cycleKey: "2026-06",
      monthlyIncome: 1_000_000,
      cycleExtra: 0,
      offCardFixed: 300_000,
      cardDebits: 450_000,
      inferredSaving: 250_000,
    });
    await seedExpense(repo, base, "2026-06-10", -110_000, "Fixed", 0);
    await seedExpense(repo, base, "2026-06-12", -190_000, "Necessary", 1);

    // July (current cycle): 400,000 of card debits.
    await seedExpense(repo, base, "2026-07-05", -100_000, "Fixed", 2);
    await seedExpense(repo, base, "2026-07-08", -200_000, "Necessary", 3);
    await seedExpense(repo, base, "2026-07-10", -100_000, "Nice to have", 4);

    const result = await performCheckin(repo, NOW, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.checkin).toMatchObject({
      cycleKey: "2026-07",
      monthlyIncome: 1_000_000,
      cycleExtra: 0,
      offCardFixed: 300_000,
      cardDebits: 400_000,
      inferredSaving: 300_000,
    });
    expect(result.assessment).toEqual({
      cycleKey: "2026-07",
      cumulative: 550_000, // 0 + 250,000 (June) + 300,000 (July)
      requiredCumulative: 200_000, // 1.2M / 12 cycles * 2 elapsed
      onTrack: true,
      cyclesElapsed: 2,
      cyclesRemaining: 10,
      requiredSaving: 65_000, // ceil((1.2M - 550k) / 10)
      expectedFixed: 110_000, // June only (Apr/May empty)
      expectedNecessary: 190_000,
      expectedSource: "history",
      allowedNiceToHave: 335_000, // 1M - 300k - 65k - 110k - 190k
      provisional: false,
    });
  });

  it("returns an error when no goal is set", async () => {
    const repo = await freshHousehold();
    expect(await performCheckin(repo, NOW, 0)).toEqual({ ok: false, error: "no-goal" });
  });

  it("marks the assessment provisional while the cycle has unclassified expenses", async () => {
    const repo = await freshHousehold();
    await seedGoalAndConfig(repo);
    const base = await seedAccount(repo, "ci-2");
    await seedExpense(repo, base, "2026-07-05", -50_000, null, 0); // pending, never classified

    const result = await performCheckin(repo, NOW, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assessment.provisional).toBe(true);
    // The pending debit still counts as card spend — only its bucket is unknown.
    expect(result.checkin.cardDebits).toBe(50_000);
  });

  it("adds one-off cycle extra income to the frozen inferred saving", async () => {
    const repo = await freshHousehold();
    await seedGoalAndConfig(repo);

    const result = await performCheckin(repo, NOW, 120_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checkin).toMatchObject({
      cycleExtra: 120_000,
      inferredSaving: 1_000_000 + 120_000 - 300_000, // no card debits this cycle
    });
  });

  it("refuses to check in before the goal's start cycle", async () => {
    const repo = await freshHousehold();
    await repo.savings.goal.upsert({
      target: 1_000_000,
      targetDate: "2027-05-31",
      startingSaved: 0,
      startCycle: "2026-09",
      currency: "ISK",
    });
    expect(await performCheckin(repo, NOW, 0)).toEqual({
      ok: false,
      error: "before-start-cycle",
    });
  });
});
