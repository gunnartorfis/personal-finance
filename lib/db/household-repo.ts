import { and, asc, count, desc, eq, getTableColumns, gte, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { ExpenseType } from "@/shared/types";

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
      /**
       * The classification work queue: transactions still awaiting classification, in a stable
       * order (oldest first) so a crash-resumable worker drains them deterministically. `limit`
       * bounds the batch in SQL so a large queue isn't materialised in memory. Each row carries any
       * manual `overrideType` (left-joined) so the worker can record it without a model call —
       * re-classifying a row the user already typed would only burn a token on a result the
       * override hides anyway.
       */
      listPending: (limit?: number) => {
        const q = db
          .select({ ...getTableColumns(transactions), overrideType: overrides.expenseType })
          .from(transactions)
          .leftJoin(
            overrides,
            and(
              eq(overrides.householdId, householdId),
              eq(overrides.transactionId, transactions.id),
            ),
          )
          .where(
            and(
              eq(transactions.householdId, householdId),
              eq(transactions.classificationStatus, "pending"),
            ),
          )
          .orderBy(asc(transactions.createdAt), asc(transactions.id));
        return limit === undefined ? q : q.limit(limit);
      },
      /**
       * Classification progress for one upload: how many of its transactions are still pending vs
       * classified vs failed. Drives the upload progress indicator (a client polls this until
       * `pending` reaches 0). Scoped to the household, so another tenant's upload id counts as zero.
       */
      progress: async (uploadId: string) => {
        const rows = await db
          .select({ status: transactions.classificationStatus, value: count() })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, householdId),
              eq(transactions.uploadId, uploadId),
            ),
          )
          .groupBy(transactions.classificationStatus);
        const counts = { pending: 0, classified: 0, failed: 0 };
        for (const row of rows) {
          counts[row.status] = row.value;
        }
        return { total: counts.pending + counts.classified + counts.failed, ...counts };
      },
      /**
       * Rows needed to compute a net summary over a half-open date range `[from, to)`: the charged
       * `amount`, the classified `expenseType`, and any manual `overrideType` (left-joined). The
       * dashboard resolves the effective type as `overrideType ?? classifiedType`. Scoped to the
       * household on both the transactions filter and the override join.
       */
      summaryRows: (range: { from: string; to: string }) =>
        db
          .select({
            amount: transactions.amount,
            classifiedType: transactions.expenseType,
            overrideType: overrides.expenseType,
          })
          .from(transactions)
          .leftJoin(
            overrides,
            and(
              eq(overrides.householdId, householdId),
              eq(overrides.transactionId, transactions.id),
            ),
          )
          .where(
            and(
              eq(transactions.householdId, householdId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to),
            ),
          ),
      /**
       * Rows for the transactions list over a half-open date range `[from, to)`: the display fields
       * plus the classified `expenseType` and any manual `overrideType` (left-joined), newest first.
       * The effective type is `overrideType ?? classifiedType`. Scoped to the household on both the
       * transactions filter and the override join.
       */
      listWithOverrides: (range: { from: string; to: string }) =>
        db
          .select({
            id: transactions.id,
            date: transactions.date,
            merchant: transactions.merchant,
            amount: transactions.amount,
            classificationStatus: transactions.classificationStatus,
            classifiedType: transactions.expenseType,
            overrideType: overrides.expenseType,
          })
          .from(transactions)
          .leftJoin(
            overrides,
            and(
              eq(overrides.householdId, householdId),
              eq(overrides.transactionId, transactions.id),
            ),
          )
          .where(
            and(
              eq(transactions.householdId, householdId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to),
            ),
          )
          .orderBy(desc(transactions.date), asc(transactions.id)),
      /** Count of classified transactions for the Household (lifetime) — used for the Free cap. */
      countClassified: async () => {
        const [row] = await db
          .select({ value: count() })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, householdId),
              eq(transactions.classificationStatus, "classified"),
            ),
          );
        return row?.value ?? 0;
      },
      /**
       * Record a classification result. Only updates a still-`pending` row, so re-running
       * classification is idempotent — an already-classified row is left untouched (returns []).
       */
      classify: (
        id: string,
        result: { expenseType: ExpenseType; confidence?: number; reasoning?: string },
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
      /** Delete a merchant rule. Returns the removed rows (empty if not in this household). */
      remove: (id: string) =>
        db
          .delete(merchantRules)
          .where(and(eq(merchantRules.id, id), eq(merchantRules.householdId, householdId)))
          .returning(),
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
      /** The override for a transaction, if one exists (one per transaction). */
      findByTransactionId: async (transactionId: string) => {
        const [row] = await db
          .select()
          .from(overrides)
          .where(
            and(eq(overrides.householdId, householdId), eq(overrides.transactionId, transactionId)),
          );
        return row;
      },
      /**
       * Set (or change) the manual Expense-type override for a transaction. One override per
       * transaction (unique `transaction_id`), so a second call updates the existing row rather than
       * inserting a duplicate. The caller must have verified the transaction is in this household —
       * the composite FK rejects a cross-household `transactionId` regardless.
       */
      upsert: (value: { transactionId: string; expenseType: ExpenseType; memberId?: string | null }) =>
        db
          .insert(overrides)
          .values({
            householdId,
            transactionId: value.transactionId,
            expenseType: value.expenseType,
            memberId: value.memberId ?? null,
          })
          .onConflictDoUpdate({
            target: overrides.transactionId,
            set: { expenseType: value.expenseType, memberId: value.memberId ?? null },
            // Defence in depth: the composite FK already makes a cross-household conflict impossible,
            // but scoping the update keeps the tenant invariant explicit at the SQL layer too.
            where: eq(overrides.householdId, householdId),
          })
          .returning(),
      /** Remove a transaction's override (revert to the classified type). Returns the removed rows. */
      remove: (transactionId: string) =>
        db
          .delete(overrides)
          .where(
            and(eq(overrides.householdId, householdId), eq(overrides.transactionId, transactionId)),
          )
          .returning(),
    },
  };
}

export type HouseholdRepo = ReturnType<typeof householdRepo>;
