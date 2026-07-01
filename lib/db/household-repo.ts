import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  isNull,
  lt,
  sql,
} from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import type { ExpenseType } from "@/shared/types"

import {
  accounts,
  merchantRules,
  overrides,
  transactions,
  uploads,
} from "./schema"
import type * as schema from "./schema"

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
type Db = NodePgDatabase<typeof schema>

/** Build a data-access surface scoped to a single Household. */
export function householdRepo(db: Db, householdId: string) {
  return {
    accounts: {
      list: () =>
        db.select().from(accounts).where(eq(accounts.householdId, householdId)),
      findById: async (id: string) => {
        const [row] = await db
          .select()
          .from(accounts)
          .where(
            and(eq(accounts.id, id), eq(accounts.householdId, householdId))
          )
        return row
      },
      create: (value: Omit<typeof accounts.$inferInsert, "householdId">) =>
        db
          .insert(accounts)
          .values({ ...value, householdId })
          .returning(),
    },
    uploads: {
      list: () =>
        db.select().from(uploads).where(eq(uploads.householdId, householdId)),
      findById: async (id: string) => {
        const [row] = await db
          .select()
          .from(uploads)
          .where(and(eq(uploads.id, id), eq(uploads.householdId, householdId)))
        return row
      },
      findByFileHash: async (fileHash: string) => {
        const [row] = await db
          .select()
          .from(uploads)
          .where(
            and(
              eq(uploads.householdId, householdId),
              eq(uploads.fileHash, fileHash)
            )
          )
        return row
      },
      create: (value: Omit<typeof uploads.$inferInsert, "householdId">) =>
        db
          .insert(uploads)
          .values({ ...value, householdId })
          .returning(),
    },
    transactions: {
      list: () =>
        db
          .select()
          .from(transactions)
          .where(eq(transactions.householdId, householdId)),
      listByAccount: (accountId: string) =>
        db
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, householdId),
              eq(transactions.accountId, accountId)
            )
          ),
      findById: async (id: string) => {
        const [row] = await db
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.id, id),
              eq(transactions.householdId, householdId)
            )
          )
        return row
      },
      create: (value: Omit<typeof transactions.$inferInsert, "householdId">) =>
        db
          .insert(transactions)
          .values({ ...value, householdId })
          .returning(),
      createMany: (
        values: Array<Omit<typeof transactions.$inferInsert, "householdId">>
      ) =>
        values.length === 0
          ? Promise.resolve([])
          : db
              .insert(transactions)
              .values(values.map((v) => ({ ...v, householdId })))
              .returning(),
      /**
       * The classification work queue: transactions still awaiting classification, in a stable
       * order (oldest first) so a crash-resumable worker drains them deterministically. `limit`
       * bounds the batch in SQL so a large queue isn't materialised in memory.
       *
       * Rows that already carry a manual override are excluded (anti-join on `overrides`): their
       * effective type is fixed by the override (which wins on read), so classifying them would only
       * burn a model call on a result the override hides — and writing the override value into
       * `expenseType` would leave stale ground-truth if the override were later removed. Removing the
       * override re-exposes the row here, so it then classifies for real (AI / merchant rule).
       */
      listPending: (limit?: number) => {
        const q = db
          .select(getTableColumns(transactions))
          .from(transactions)
          .leftJoin(
            overrides,
            and(
              eq(overrides.householdId, householdId),
              eq(overrides.transactionId, transactions.id)
            )
          )
          .where(
            and(
              eq(transactions.householdId, householdId),
              eq(transactions.classificationStatus, "pending"),
              isNull(overrides.id)
            )
          )
          .orderBy(asc(transactions.createdAt), asc(transactions.id))
        return limit === undefined ? q : q.limit(limit)
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
              eq(transactions.uploadId, uploadId)
            )
          )
          .groupBy(transactions.classificationStatus)
        const counts = { pending: 0, classified: 0, failed: 0 }
        for (const row of rows) {
          counts[row.status] = row.value
        }
        return {
          total: counts.pending + counts.classified + counts.failed,
          ...counts,
        }
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
              eq(overrides.transactionId, transactions.id)
            )
          )
          .where(
            and(
              eq(transactions.householdId, householdId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to)
            )
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
            confidence: transactions.confidence,
            reasoning: transactions.reasoning,
            overrideType: overrides.expenseType,
          })
          .from(transactions)
          .leftJoin(
            overrides,
            and(
              eq(overrides.householdId, householdId),
              eq(overrides.transactionId, transactions.id)
            )
          )
          .where(
            and(
              eq(transactions.householdId, householdId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to)
            )
          )
          .orderBy(desc(transactions.date), asc(transactions.id)),
      /**
       * Per-calendar-month spend series over a half-open date range `[from, to)`: for each month
       * with at least one transaction, the total `spending` (magnitude of debits, `amount < 0`) and
       * `moneyIn` (sum of credits, `amount > 0`). Drives the dashboard's rolling 12-month trend.
       * Months with no rows are simply absent — the pure builder fills the gaps. `sum(...)` comes back
       * as a string from the driver, so both totals are coerced to numbers. Scoped to the household.
       */
      monthlySpendSeries: async (range: { from: string; to: string }) => {
        const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
        const spending = sql<string>`coalesce(sum(case when ${transactions.amount} < 0 then -${transactions.amount} else 0 end), 0)`;
        const moneyIn = sql<string>`coalesce(sum(case when ${transactions.amount} > 0 then ${transactions.amount} else 0 end), 0)`;
        const rows = await db
          .select({ month, spending, moneyIn })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, householdId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to)
            )
          )
          .groupBy(month)
          .orderBy(asc(month));
        return rows.map((row) => ({
          month: row.month,
          spending: Number(row.spending),
          moneyIn: Number(row.moneyIn),
        }));
      },
      /**
       * The distinct statement cycles (calendar months as `"YYYY-MM"`) that have at least one
       * transaction for this Household, newest first. Drives the period selector on the transactions
       * view. The month is derived in SQL from the date-only `date` column so it lines up exactly
       * with the `[from, to)` cycle ranges used to list and summarise a period.
       */
      cycleMonths: async () => {
        const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`
        const rows = await db
          .select({ month })
          .from(transactions)
          .where(eq(transactions.householdId, householdId))
          .groupBy(month)
          .orderBy(desc(month))
        return rows.map((row) => row.month)
      },
      /**
       * The household-wide rapid-review backlog broken down by statement cycle: each calendar month
       * (`"YYYY-MM"`) that still has at least one expense (`amount < 0`) without a manual override,
       * with how many, newest-first. Drives where the transactions view lands by default (the newest
       * month that still has work) and the Rapid review badge total (the sum of the counts). Anti-join
       * on `overrides` (`isNull(overrides.id)`) so a settled row never counts — mirroring the queue
       * itself, so the badge total equals the number of cards {@link reviewQueue} will present.
       */
      reviewQueueMonths: async () => {
        const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`
        const rows = await db
          .select({ month, value: count() })
          .from(transactions)
          .leftJoin(
            overrides,
            and(
              eq(overrides.householdId, householdId),
              eq(overrides.transactionId, transactions.id)
            )
          )
          .where(
            and(
              eq(transactions.householdId, householdId),
              lt(transactions.amount, 0),
              isNull(overrides.id)
            )
          )
          .groupBy(month)
          .orderBy(desc(month))
        return rows.map((row) => ({ month: row.month, count: row.value }))
      },
      /**
       * The whole-household rapid-review queue: every expense (`amount < 0`) with no manual override,
       * across all statement cycles, in the same row shape as {@link listWithOverrides} so
       * `<ReviewMode>` consumes it directly. Newest-first (the overlay re-sorts least-confident-first).
       * Unlike the per-period list this spans every month, so the overlay can drain the whole backlog
       * regardless of which period the user is viewing. `overrideType` is always `null` here (the
       * anti-join keeps overridden rows out) but is selected to keep the shape identical.
       *
       * `limit` bounds the batch in SQL so a large backlog never ships as one unbounded payload; the
       * newest rows come first, and because reviewing a row writes an override that drops it from this
       * query, closing and reopening the overlay fetches the next batch — the queue drains across
       * sessions rather than materialising all at once.
       */
      reviewQueue: (limit?: number) => {
        const q = db
          .select({
            id: transactions.id,
            date: transactions.date,
            merchant: transactions.merchant,
            amount: transactions.amount,
            classificationStatus: transactions.classificationStatus,
            classifiedType: transactions.expenseType,
            confidence: transactions.confidence,
            reasoning: transactions.reasoning,
            overrideType: overrides.expenseType,
          })
          .from(transactions)
          .leftJoin(
            overrides,
            and(
              eq(overrides.householdId, householdId),
              eq(overrides.transactionId, transactions.id)
            )
          )
          .where(
            and(
              eq(transactions.householdId, householdId),
              lt(transactions.amount, 0),
              isNull(overrides.id)
            )
          )
          .orderBy(desc(transactions.date), asc(transactions.id))
        return limit === undefined ? q : q.limit(limit)
      },
      /** Count of classified transactions for the Household (lifetime) — used for the Free cap. */
      countClassified: async () => {
        const [row] = await db
          .select({ value: count() })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, householdId),
              eq(transactions.classificationStatus, "classified")
            )
          )
        return row?.value ?? 0
      },
      /** Count of transactions left in `failed` state — drives the "Retry failed" affordance. */
      countFailed: async () => {
        const [row] = await db
          .select({ value: count() })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, householdId),
              eq(transactions.classificationStatus, "failed")
            )
          )
        return row?.value ?? 0
      },
      /**
       * Record a classification result. Only updates a still-`pending` row, so re-running
       * classification is idempotent — an already-classified row is left untouched (returns []).
       */
      classify: (
        id: string,
        result: {
          expenseType: ExpenseType
          confidence?: number
          reasoning?: string
        }
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
              eq(transactions.classificationStatus, "pending")
            )
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
              eq(transactions.classificationStatus, "pending")
            )
          )
          .returning(),
      /**
       * Requeue every `failed` transaction in the Household back to `pending` so the next drain
       * re-attempts it — used after the cause of a prior failure is cleared (e.g. AI Gateway
       * credits topped up, a transient outage). Failed rows are already unbucketed, so only the
       * status flips. Scoped to the household and to `failed` rows; classified/pending are
       * untouched. Returns the requeued rows (the count is the only thing callers need).
       */
      resetFailed: () =>
        db
          .update(transactions)
          .set({ classificationStatus: "pending" })
          .where(
            and(
              eq(transactions.householdId, householdId),
              eq(transactions.classificationStatus, "failed")
            )
          )
          .returning(),
    },
    merchantRules: {
      list: () =>
        db
          .select()
          .from(merchantRules)
          .where(eq(merchantRules.householdId, householdId)),
      findById: async (id: string) => {
        const [row] = await db
          .select()
          .from(merchantRules)
          .where(
            and(
              eq(merchantRules.id, id),
              eq(merchantRules.householdId, householdId)
            )
          )
        return row
      },
      create: (value: Omit<typeof merchantRules.$inferInsert, "householdId">) =>
        db
          .insert(merchantRules)
          .values({ ...value, householdId })
          .returning(),
      /** Delete a merchant rule. Returns the removed rows (empty if not in this household). */
      remove: (id: string) =>
        db
          .delete(merchantRules)
          .where(
            and(
              eq(merchantRules.id, id),
              eq(merchantRules.householdId, householdId)
            )
          )
          .returning(),
    },
    overrides: {
      list: () =>
        db
          .select()
          .from(overrides)
          .where(eq(overrides.householdId, householdId)),
      findById: async (id: string) => {
        const [row] = await db
          .select()
          .from(overrides)
          .where(
            and(eq(overrides.id, id), eq(overrides.householdId, householdId))
          )
        return row
      },
      create: (value: Omit<typeof overrides.$inferInsert, "householdId">) =>
        db
          .insert(overrides)
          .values({ ...value, householdId })
          .returning(),
      /** The override for a transaction, if one exists (one per transaction). */
      findByTransactionId: async (transactionId: string) => {
        const [row] = await db
          .select()
          .from(overrides)
          .where(
            and(
              eq(overrides.householdId, householdId),
              eq(overrides.transactionId, transactionId)
            )
          )
        return row
      },
      /**
       * Set (or change) the manual Expense-type override for a transaction. One override per
       * transaction (unique `transaction_id`), so a second call updates the existing row rather than
       * inserting a duplicate. The caller must have verified the transaction is in this household —
       * the composite FK rejects a cross-household `transactionId` regardless.
       */
      upsert: (value: {
        transactionId: string
        expenseType: ExpenseType
        memberId?: string | null
      }) =>
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
            set: {
              expenseType: value.expenseType,
              memberId: value.memberId ?? null,
            },
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
            and(
              eq(overrides.householdId, householdId),
              eq(overrides.transactionId, transactionId)
            )
          )
          .returning(),
    },
  }
}

export type HouseholdRepo = ReturnType<typeof householdRepo>
