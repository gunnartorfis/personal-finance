import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import {
  accounts,
  activityLog,
  assistantConversations,
  assistantMessages,
  households,
  members,
  merchantRules,
  overrides,
  transactions,
  uploads,
} from "@/lib/db/schema";

import { resetHouseholdFinancialData } from "./reset";

const ACTOR = { memberId: "00000000-0000-0000-0000-0000000000aa", actorName: "Ada" };

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof resetHouseholdFinancialData>[0];

/** Seed one Household with a member and one row in every financial table. Returns its id. */
async function seedHousehold(authUserId: string, fileHash: string): Promise<string> {
  const [household] = await db.insert(households).values({}).returning();
  const householdId = household.id;
  await db.insert(members).values({ householdId, authUserId });

  const [account] = await db.insert(accounts).values({ householdId, name: "Visa" }).returning();
  const [upload] = await db
    .insert(uploads)
    .values({ householdId, accountId: account.id, fileName: "statement.csv", fileHash })
    .returning();
  const [transaction] = await db
    .insert(transactions)
    .values({
      householdId,
      accountId: account.id,
      uploadId: upload.id,
      date: "2026-01-15",
      amount: -1000,
      merchant: "Netto",
      rawCategory: "Groceries",
      sourceRow: 1,
    })
    .returning();
  await db
    .insert(overrides)
    .values({ householdId, transactionId: transaction.id, expenseType: "Necessary" });
  await db.insert(merchantRules).values({ householdId, merchant: "netto", flatType: "Necessary" });

  return householdId;
}

async function counts(householdId: string) {
  const rows = async (table: typeof accounts | typeof uploads | typeof transactions) =>
    (await db.select().from(table).where(eq(table.householdId, householdId))).length;
  return {
    accounts: await rows(accounts),
    uploads: await rows(uploads),
    transactions: await rows(transactions),
    overrides: (await db.select().from(overrides).where(eq(overrides.householdId, householdId)))
      .length,
    merchantRules: (
      await db.select().from(merchantRules).where(eq(merchantRules.householdId, householdId))
    ).length,
  };
}

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("resetHouseholdFinancialData", () => {
  it("wipes every financial row for the household but keeps the household and its members", async () => {
    const householdId = await seedHousehold("reset_user", "hash-a");
    expect(await counts(householdId)).toEqual({
      accounts: 1,
      uploads: 1,
      transactions: 1,
      overrides: 1,
      merchantRules: 1,
    });

    await resetHouseholdFinancialData(asDb(db), householdId, ACTOR);

    // A reset returns the household to its just-provisioned state: data gone, but the single
    // default account restored so the household never exists without one.
    expect(await counts(householdId)).toEqual({
      accounts: 1,
      uploads: 0,
      transactions: 0,
      overrides: 0,
      merchantRules: 0,
    });
    const remaining = await db
      .select()
      .from(accounts)
      .where(eq(accounts.householdId, householdId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isDefault).toBe(true);
    // The tenant survives the data wipe.
    expect(
      await db.select().from(households).where(eq(households.id, householdId)),
    ).toHaveLength(1);
    expect(
      await db.select().from(members).where(eq(members.householdId, householdId)),
    ).toHaveLength(1);
  });

  it("does not touch another household's data (tenant isolation)", async () => {
    const target = await seedHousehold("victim_user", "hash-b");
    const other = await seedHousehold("bystander_user", "hash-c");

    await resetHouseholdFinancialData(asDb(db), target, ACTOR);

    expect(await counts(other)).toEqual({
      accounts: 1,
      uploads: 1,
      transactions: 1,
      overrides: 1,
      merchantRules: 1,
    });
  });

  it("clears Assistant conversations and messages (ADR-0018: unlike the Activity log)", async () => {
    const householdId = await seedHousehold("assistant_user", "hash-d");
    const [conv] = await db
      .insert(assistantConversations)
      .values({ householdId, startedByMemberId: null, title: "Why was March higher?" })
      .returning();
    await db
      .insert(assistantMessages)
      .values({ householdId, conversationId: conv.id, memberId: null, role: "assistant", content: "…" });

    await resetHouseholdFinancialData(asDb(db), householdId, ACTOR);

    expect(
      await db
        .select()
        .from(assistantConversations)
        .where(eq(assistantConversations.householdId, householdId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(assistantMessages)
        .where(eq(assistantMessages.householdId, householdId)),
    ).toHaveLength(0);
  });

  // ADR-0017: the reset is itself a logged action, and the Activity log deliberately SURVIVES the
  // data reset — a reset that erased the log would let one partner destroy the evidence of their
  // edits, the exact failure the Trust feature exists to prevent.
  it("records a data.reset activity entry attributed to the actor", async () => {
    const householdId = await seedHousehold("reset_logs", "hash-r1");

    await resetHouseholdFinancialData(asDb(db), householdId, ACTOR);

    const log = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.householdId, householdId));
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe("data.reset");
    expect(log[0].actorName).toBe("Ada");
    expect(log[0].memberId).toBe(ACTOR.memberId);
  });

  it("keeps activity entries recorded before the reset (the log survives)", async () => {
    const householdId = await seedHousehold("reset_survive", "hash-r2");
    await db.insert(activityLog).values({
      householdId,
      memberId: ACTOR.memberId,
      actorName: "Ada",
      action: "transaction.excluded",
      payload: { transactionId: "tx-1", summary: "Excluded Netflix" },
    });

    await resetHouseholdFinancialData(asDb(db), householdId, ACTOR);

    const actions = (
      await db.select().from(activityLog).where(eq(activityLog.householdId, householdId))
    ).map((e) => e.action);
    expect(actions).toContain("transaction.excluded"); // pre-reset entry survived
    expect(actions).toContain("data.reset"); // reset logged itself
    expect(actions).toHaveLength(2);
  });
});
