import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { accounts, merchantRules, overrides, transactions, uploads } from "./schema";
import type * as schema from "./schema";

/**
 * Household-scoped data access (ADR-0002).
 *
 * The tenant boundary is the Household, so application code must never query across households.
 * This repository binds a `householdId` once and scopes every read and write to it: lists and
 * single-row reads filter by `household_id`, and inserts stamp it (callers cannot pass a different
 * one — it is omitted from the insert types). The schema's composite foreign keys provide a second
 * line of defence at the database, so a mis-scoped reference is rejected even if the app layer slips.
 *
 * Works with any drizzle database bound to the schema (the live Neon pool, or pglite in tests).
 */

// The application database, bound to this schema. Tests pass a pglite-backed database cast to
// this type — the query surface used here (select/insert) is identical across drivers.
type Db = NodePgDatabase<typeof schema>;

/** Build a data-access surface scoped to a single Household. */
export function householdRepo(db: Db, householdId: string) {
  return {
    accounts: {
      list: () => db.select().from(accounts).where(eq(accounts.householdId, householdId)),
      findById: async (id: string) => {
        const [row] = await db
          .select()
          .from(accounts)
          .where(and(eq(accounts.id, id), eq(accounts.householdId, householdId)));
        return row;
      },
      create: (value: Omit<typeof accounts.$inferInsert, "householdId">) =>
        db.insert(accounts).values({ ...value, householdId }).returning(),
    },
    uploads: {
      list: () => db.select().from(uploads).where(eq(uploads.householdId, householdId)),
      findById: async (id: string) => {
        const [row] = await db
          .select()
          .from(uploads)
          .where(and(eq(uploads.id, id), eq(uploads.householdId, householdId)));
        return row;
      },
      findByFileHash: async (fileHash: string) => {
        const [row] = await db
          .select()
          .from(uploads)
          .where(and(eq(uploads.householdId, householdId), eq(uploads.fileHash, fileHash)));
        return row;
      },
      create: (value: Omit<typeof uploads.$inferInsert, "householdId">) =>
        db.insert(uploads).values({ ...value, householdId }).returning(),
    },
    transactions: {
      list: () => db.select().from(transactions).where(eq(transactions.householdId, householdId)),
      listByAccount: (accountId: string) =>
        db
          .select()
          .from(transactions)
          .where(and(eq(transactions.householdId, householdId), eq(transactions.accountId, accountId))),
      findById: async (id: string) => {
        const [row] = await db
          .select()
          .from(transactions)
          .where(and(eq(transactions.id, id), eq(transactions.householdId, householdId)));
        return row;
      },
      create: (value: Omit<typeof transactions.$inferInsert, "householdId">) =>
        db.insert(transactions).values({ ...value, householdId }).returning(),
      createMany: (values: Array<Omit<typeof transactions.$inferInsert, "householdId">>) =>
        values.length === 0
          ? Promise.resolve([])
          : db
              .insert(transactions)
              .values(values.map((v) => ({ ...v, householdId })))
              .returning(),
      /** The classification work queue: transactions still awaiting classification. */
      listPending: () =>
        db
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, householdId),
              eq(transactions.classificationStatus, "pending"),
            ),
          ),
      /**
       * Record a classification result. Only updates a still-`pending` row, so re-running
       * classification is idempotent — an already-classified row is left untouched (returns []).
       */
      classify: (
        id: string,
        result: { expenseType: string; confidence?: number; reasoning?: string },
      ) =>
        db
          .update(transactions)
          .set({
            classificationStatus: "classified",
            expenseType: result.expenseType,
            confidence: result.confidence ?? null,
            reasoning: result.reasoning ?? null,
          })
          .where(
            and(
              eq(transactions.id, id),
              eq(transactions.householdId, householdId),
              eq(transactions.classificationStatus, "pending"),
            ),
          )
          .returning(),
      /** Mark a pending transaction as failed (e.g. the model errored); leaves it unbucketed. */
      markFailed: (id: string) =>
        db
          .update(transactions)
          .set({ classificationStatus: "failed" })
          .where(
            and(
              eq(transactions.id, id),
              eq(transactions.householdId, householdId),
              eq(transactions.classificationStatus, "pending"),
            ),
          )
          .returning(),
    },
    merchantRules: {
      list: () => db.select().from(merchantRules).where(eq(merchantRules.householdId, householdId)),
      findById: async (id: string) => {
        const [row] = await db
          .select()
          .from(merchantRules)
          .where(and(eq(merchantRules.id, id), eq(merchantRules.householdId, householdId)));
        return row;
      },
      create: (value: Omit<typeof merchantRules.$inferInsert, "householdId">) =>
        db.insert(merchantRules).values({ ...value, householdId }).returning(),
    },
    overrides: {
      list: () => db.select().from(overrides).where(eq(overrides.householdId, householdId)),
      findById: async (id: string) => {
        const [row] = await db
          .select()
          .from(overrides)
          .where(and(eq(overrides.id, id), eq(overrides.householdId, householdId)));
        return row;
      },
      create: (value: Omit<typeof overrides.$inferInsert, "householdId">) =>
        db.insert(overrides).values({ ...value, householdId }).returning(),
    },
  };
}

export type HouseholdRepo = ReturnType<typeof householdRepo>;
