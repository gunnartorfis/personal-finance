import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  ne,
  notInArray,
  or,
  sql,
  TransactionRollbackError,
} from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import { DERIVED_REASONS, MERCHANT_RULE_REASON } from "@/lib/classification/reasons"
import { REVIEW_CONFIDENCE_CEILING } from "@/lib/transactions/review-config"
import { applyMerchantRules, toMerchantRule } from "@/shared/merchant-rules"
import type { ExpenseType } from "@/shared/types"

import {
  accountBalances,
  accounts,
  activityLog,
  bankConnections,
  categoryBudgets,
  householdInvites,
  members,
  merchantRules,
  overrides,
  savingsGoals,
  savingsIncomeSources,
  savingsOffcardCosts,
  savingsOneOffAdjustments,
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

// A drizzle transaction handle (or the db itself) — what the savings swap helpers write through.
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0]

/** Build a data-access surface scoped to a single Household. */
export function householdRepo(db: Db, householdId: string) {
  // Full-set swaps for the Savings config lists (delete + insert). Callers wrap these in a
  // transaction — per list for a single-list replace, or one shared transaction for
  // `savings.replaceConfig` so the two lists can never commit half-updated.
  const swapIncomeSources = async (
    tx: DbOrTx,
    values: Array<Omit<typeof savingsIncomeSources.$inferInsert, "householdId">>
  ): Promise<Array<typeof savingsIncomeSources.$inferSelect>> => {
    await tx
      .delete(savingsIncomeSources)
      .where(eq(savingsIncomeSources.householdId, householdId))
    if (values.length === 0) return []
    return tx
      .insert(savingsIncomeSources)
      .values(values.map((v) => ({ ...v, householdId })))
      .returning()
  }
  const swapOffcardCosts = async (
    tx: DbOrTx,
    values: Array<Omit<typeof savingsOffcardCosts.$inferInsert, "householdId">>
  ): Promise<Array<typeof savingsOffcardCosts.$inferSelect>> => {
    await tx
      .delete(savingsOffcardCosts)
      .where(eq(savingsOffcardCosts.householdId, householdId))
    if (values.length === 0) return []
    return tx
      .insert(savingsOffcardCosts)
      .values(values.map((v) => ({ ...v, householdId })))
      .returning()
  }
  // Same full-set-swap shape as the recurring lists above, for the per-cycle One-off adjustments
  // (ADR-0015) — the config form saves the whole set at once.
  const swapOneOffAdjustments = async (
    tx: DbOrTx,
    values: Array<Omit<typeof savingsOneOffAdjustments.$inferInsert, "householdId">>
  ): Promise<Array<typeof savingsOneOffAdjustments.$inferSelect>> => {
    await tx
      .delete(savingsOneOffAdjustments)
      .where(eq(savingsOneOffAdjustments.householdId, householdId))
    if (values.length === 0) return []
    return tx
      .insert(savingsOneOffAdjustments)
      .values(values.map((v) => ({ ...v, householdId })))
      .returning()
  }
  // Full-set swap for the per-category budgets (#103): the budgets settings form saves the whole
  // set at once, same delete + insert shape as the savings lists.
  const swapCategoryBudgets = async (
    tx: DbOrTx,
    values: Array<Omit<typeof categoryBudgets.$inferInsert, "householdId">>
  ): Promise<Array<typeof categoryBudgets.$inferSelect>> => {
    await tx.delete(categoryBudgets).where(eq(categoryBudgets.householdId, householdId))
    if (values.length === 0) return []
    return tx
      .insert(categoryBudgets)
      .values(values.map((v) => ({ ...v, householdId })))
      .returning()
  }

  /**
   * Re-type every non-overridden expense that matches the Household's current Merchant rules
   * (CONTEXT.md: adding a rule re-types all matching Transactions except those with a manual
   * Override). Shared by the standalone repo method and the atomic create-then-apply path, so it
   * writes through whatever `tx` it is given. Reads rules through the same `tx` so a rule inserted
   * earlier in the same transaction is visible here.
   *
   * Matching normalizes the merchant and honours split thresholds, so it runs in JS over the
   * candidates. The SQL narrows to non-overridden debits (`amount < 0` — credits never match a
   * rule) so positive rows aren't pulled into memory only to be discarded. Matched ids are grouped
   * by target type and flushed as one UPDATE per type (not one per row). Returns the count re-typed.
   */
  const retypeMatchingRows = async (tx: DbOrTx): Promise<number> => {
    const rules = (
      await tx
        .select()
        .from(merchantRules)
        .where(eq(merchantRules.householdId, householdId))
    ).map(toMerchantRule)
    if (rules.length === 0) return 0

    const candidates = await tx
      .select({
        id: transactions.id,
        merchant: transactions.merchant,
        amount: transactions.amount,
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

    const idsByType = new Map<ExpenseType, string[]>()
    for (const row of candidates) {
      const match = applyMerchantRules(rules, { merchant: row.merchant, amount: row.amount })
      if (!match.matched) continue
      const ids = idsByType.get(match.type)
      if (ids) ids.push(row.id)
      else idsByType.set(match.type, [row.id])
    }

    let retyped = 0
    for (const [expenseType, ids] of idsByType) {
      await tx
        .update(transactions)
        .set({
          classificationStatus: "classified",
          expenseType,
          confidence: 1,
          reasoning: MERCHANT_RULE_REASON,
        })
        .where(
          and(eq(transactions.householdId, householdId), inArray(transactions.id, ids))
        )
      retyped += ids.length
    }
    return retyped
  }

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
      /**
       * Find a synced Account by its Bank connection + aggregator account id — the key for idempotent
       * account discovery on (re)connect, so re-running a sync never duplicates an account.
       */
      /** The synced Accounts belonging to one Bank connection (for sync). */
      listByConnection: (connectionId: string) =>
        db
          .select()
          .from(accounts)
          .where(
            and(eq(accounts.householdId, householdId), eq(accounts.connectionId, connectionId))
          ),
      bySyncKey: async (connectionId: string, externalAccountId: string) => {
        const [row] = await db
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.householdId, householdId),
              eq(accounts.connectionId, connectionId),
              eq(accounts.externalAccountId, externalAccountId)
            )
          )
        return row
      },
      /** Append-only Account balance snapshots for net worth (ADR-0016). */
      balances: {
        /** Record one balance observation for an Account (manual entry or a bank sync). */
        insert: (value: Omit<typeof accountBalances.$inferInsert, "householdId">) =>
          db
            .insert(accountBalances)
            .values({ ...value, householdId })
            .returning(),
        /**
         * Record several Accounts' balances in one atomic multi-row insert — the manual-entry form
         * saves every field at once, so a mid-batch failure must not leave net worth reflecting a
         * partial update (some Accounts' new snapshots committed, others not).
         */
        insertMany: (values: Array<Omit<typeof accountBalances.$inferInsert, "householdId">>) =>
          db
            .insert(accountBalances)
            .values(values.map((value) => ({ ...value, householdId })))
            .returning(),
        /**
         * The latest snapshot per Account for the Household — newest `asOf` wins (created_at breaks a
         * tie). One row per Account with any snapshot; Accounts without one are simply absent. This is
         * what net worth sums ({@link import("@/lib/dashboard/net-worth").computeNetWorth}).
         */
        latestPerAccount: () =>
          db
            .selectDistinctOn([accountBalances.accountId])
            .from(accountBalances)
            .where(eq(accountBalances.householdId, householdId))
            .orderBy(
              accountBalances.accountId,
              desc(accountBalances.asOf),
              desc(accountBalances.createdAt)
            ),
        /**
         * Every balance snapshot for the Household, grouped-friendly (by account, then oldest first) —
         * the history a balance check (#98) walks to compare consecutive snapshots.
         */
        list: () =>
          db
            .select()
            .from(accountBalances)
            .where(eq(accountBalances.householdId, householdId))
            .orderBy(
              accountBalances.accountId,
              asc(accountBalances.asOf),
              asc(accountBalances.createdAt)
            ),
      },
    },
    bankConnections: {
      list: () =>
        db
          .select()
          .from(bankConnections)
          .where(eq(bankConnections.householdId, householdId)),
      /** Connections currently syncable (status `active`) — the daily sync's work set. */
      listActive: () =>
        db
          .select()
          .from(bankConnections)
          .where(
            and(
              eq(bankConnections.householdId, householdId),
              eq(bankConnections.status, "active")
            )
          ),
      findById: async (id: string) => {
        const [row] = await db
          .select()
          .from(bankConnections)
          .where(
            and(
              eq(bankConnections.id, id),
              eq(bankConnections.householdId, householdId)
            )
          )
        return row
      },
      /** Find a connection by its aggregator (provider, consent) — for idempotent (re)connect. */
      byProviderConnectionId: async (provider: string, providerConnectionId: string) => {
        const [row] = await db
          .select()
          .from(bankConnections)
          .where(
            and(
              eq(bankConnections.householdId, householdId),
              eq(bankConnections.provider, provider),
              eq(bankConnections.providerConnectionId, providerConnectionId)
            )
          )
        return row
      },
      /**
       * A non-revoked connection for an institution — the reconnect target. Re-running consent issues
       * a new session id, so matching on the institution lets {@link completeBankConnection} refresh
       * the existing connection (and keep its accounts + history) in place instead of leaving a stale
       * error/expired row that keeps triggering the reconnect alert (#116).
       */
      byInstitution: async (provider: string, institutionName: string) => {
        const [row] = await db
          .select()
          .from(bankConnections)
          .where(
            and(
              eq(bankConnections.householdId, householdId),
              eq(bankConnections.provider, provider),
              eq(bankConnections.institutionName, institutionName),
              ne(bankConnections.status, "revoked")
            )
          )
        return row
      },
      // Tokens (accessToken/refreshToken) are intentionally NOT settable here — and no other write
      // path exists anywhere, so a raw bearer token can never be persisted. If persisting aggregator
      // tokens ever becomes necessary, add app-layer encryption first; do not widen this type to
      // accept raw tokens.
      create: (
        value: Omit<
          typeof bankConnections.$inferInsert,
          "householdId" | "accessToken" | "refreshToken"
        >
      ) =>
        db
          .insert(bankConnections)
          .values({ ...value, householdId })
          .returning(),
      /**
       * Patch a connection's mutable lifecycle fields. Scoped to the household, so a foreign
       * connection id updates nothing. Returns the updated row(s). Tokens are excluded (see above).
       */
      update: (
        id: string,
        patch: Partial<
          Pick<
            typeof bankConnections.$inferInsert,
            | "status"
            | "consentExpiresAt"
            | "lastSyncedAt"
            | "institutionId"
            | "institutionName"
            // Re-pointed on reconnect: a new consent issues a fresh session id for the same connection.
            | "providerConnectionId"
          >
        >
      ) =>
        db
          .update(bankConnections)
          .set(patch)
          .where(
            and(
              eq(bankConnections.id, id),
              eq(bankConnections.householdId, householdId)
            )
          )
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
      /**
       * Candidate rows for inter-account transfer detection (#97): the minimal `{id, accountId,
       * amount, date}` for every not-yet-linked, non-excluded Transaction. Filtered in SQL (uses the
       * partial `transfer_group_id` index) so an import doesn't ship a household's whole history just
       * to pair a couple of legs. Feeds the pure `detectTransferPairs`.
       */
      transferCandidates: () =>
        db
          .select({
            id: transactions.id,
            accountId: transactions.accountId,
            amount: transactions.amount,
            date: transactions.date,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, householdId),
              isNull(transactions.transferGroupId),
              eq(transactions.excluded, false)
            )
          ),
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
       * Insert synced (bank_sync) rows, skipping any that already exist by
       * `(household, account, externalId)` — idempotent against the partial unique index, so a
       * re-sync of an overlapping window never duplicates a transaction. Returns only the newly
       * inserted rows (the count of genuinely new transactions).
       */
      createSyncedMany: (
        values: Array<Omit<typeof transactions.$inferInsert, "householdId">>
      ) =>
        values.length === 0
          ? Promise.resolve([])
          : db
              .insert(transactions)
              .values(values.map((v) => ({ ...v, householdId })))
              .onConflictDoNothing({
                target: [
                  transactions.householdId,
                  transactions.accountId,
                  transactions.externalId,
                ],
                // Match the partial unique index's predicate so Postgres infers it as the arbiter.
                where: sql`${transactions.externalId} is not null`,
              })
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
       * Rows needed to compute a net summary over a half-open date range `[from, to)`: the spend
       * `amount` (the Own share when a Shared expense, else the charge — ADR-0014), the classified
       * `expenseType`, and any manual `overrideType` (left-joined). The dashboard resolves the
       * effective type as `overrideType ?? classifiedType`. `effectiveAmount` equals the charge for
       * credits and non-shared debits, so income detection (`amount > 0`) is unaffected. Scoped to
       * the household on both the transactions filter and the override join.
       */
      summaryRows: (range: { from: string; to: string }) =>
        db
          .select({
            amount: transactions.effectiveAmount,
            incomeMarked: transactions.incomeMarked,
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
              // Excluded rows contribute to nothing (ADR-0011).
              eq(transactions.excluded, false),
              // Both legs of a detected inter-account transfer are money movement, not spend or
              // income — drop them so a card-bill payment doesn't double-count (issue #97).
              isNull(transactions.transferGroupId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to)
            )
          ),
      /**
       * Rows for the transactions list over a half-open date range `[from, to)`: the display fields
       * plus the classified `expenseType` and any manual `overrideType` (left-joined), newest first.
       * The effective type is `overrideType ?? classifiedType`. The list shows the true charged
       * `amount`; `ownShareAmount` (ADR-0014) rides along so a Shared expense can annotate its share
       * without changing the displayed face value. Scoped to the household on both the transactions
       * filter and the override join.
       */
      listWithOverrides: (range: { from: string; to: string }) =>
        db
          .select({
            id: transactions.id,
            date: transactions.date,
            merchant: transactions.merchant,
            amount: transactions.amount,
            ownShareAmount: transactions.ownShareAmount,
            incomeMarked: transactions.incomeMarked,
            excluded: transactions.excluded,
            exclusionNote: transactions.exclusionNote,
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
       * `income` (sum of credits manually marked as income — unmarked credits count for nothing,
       * ADR-0009). Drives the dashboard's rolling 12-month trend.
       * Months with no rows are simply absent — the pure builder fills the gaps. `sum(...)` comes back
       * as a string from the driver, so both totals are coerced to numbers. Scoped to the household.
       */
      monthlySpendSeries: async (range: { from: string; to: string }) => {
        const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
        // Spend counts the Own share on a Shared expense (effective_amount), never the full charge
        // (ADR-0014); income is unaffected — effective_amount equals amount for credits.
        const spending = sql<string>`coalesce(sum(case when ${transactions.amount} < 0 then -${transactions.effectiveAmount} else 0 end), 0)`;
        const income = sql<string>`coalesce(sum(case when ${transactions.amount} > 0 and ${transactions.incomeMarked} then ${transactions.amount} else 0 end), 0)`;
        const rows = await db
          .select({ month, spending, income })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, householdId),
              // Excluded rows contribute to neither spending nor income (ADR-0011).
              eq(transactions.excluded, false),
              // Detected inter-account transfer legs are money movement, not spend or income (#97).
              isNull(transactions.transferGroupId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to)
            )
          )
          .groupBy(month)
          .orderBy(asc(month));
        return rows.map((row) => ({
          month: row.month,
          spending: Number(row.spending),
          income: Number(row.income),
        }));
      },
      /**
       * Total debit magnitude per raw merchant over a half-open range `[from, to)` — credits
       * (`amount >= 0`) and out-of-range rows excluded. Grouped by the raw merchant string only; the
       * pure `buildTopMerchants` then normalises (store-number stripping etc.) and re-aggregates, so
       * merging and the top-N limit happen after normalisation rather than in SQL. Transactions whose
       * effective type (`coalesce(override, classified)`) is "" — the not-bucketed / split type — are
       * excluded. Scoped to the household. `sum(...)` comes back as a string from the driver, so it is
       * coerced to a number.
       */
      topMerchants: async (range: { from: string; to: string }) => {
        // Own share, not the full charge, on a Shared expense (ADR-0014); equal for ordinary rows.
        const spending = sql<string>`sum(-${transactions.effectiveAmount})`;
        const rows = await db
          .select({ merchant: transactions.merchant, spending })
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
              // Excluded rows are not spending (ADR-0011).
              eq(transactions.excluded, false),
              // Neither is a detected inter-account transfer leg — it's money movement, not spend (#97).
              isNull(transactions.transferGroupId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to),
              sql`coalesce(${overrides.expenseType}, ${transactions.expenseType}) is distinct from ''`
            )
          )
          .groupBy(transactions.merchant);
        return rows.map((row) => ({ merchant: row.merchant, spending: Number(row.spending) }));
      },
      /**
       * Per-calendar-month, per-effective-expense-type debit magnitude over a half-open range
       * `[from, to)` — the stacked category-mix trend. The effective type is
       * `coalesce(override, classified)` (so a manual Override wins, matching the dashboard); a null
       * result (pending/failed) is returned as-is and folded into "unclassified" by the pure builder.
       * Credits (`amount >= 0`) and out-of-range rows are excluded. Scoped to the household on both
       * the transactions filter and the override join; `sum(...)` is coerced from the driver string.
       */
      monthlyCategorySpend: async (range: { from: string; to: string }) => {
        const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
        const effectiveType = sql<
          string | null
        >`coalesce(${overrides.expenseType}, ${transactions.expenseType})`;
        // Own share, not the full charge, on a Shared expense (ADR-0014); equal for ordinary rows.
        const spending = sql<string>`sum(-${transactions.effectiveAmount})`;
        const rows = await db
          .select({ month, effectiveType, spending })
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
              // Excluded rows are not spending (ADR-0011).
              eq(transactions.excluded, false),
              // Neither is a detected inter-account transfer leg — it's money movement, not spend (#97).
              isNull(transactions.transferGroupId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to)
            )
          )
          .groupBy(month, effectiveType)
          .orderBy(asc(month));
        return rows.map((row) => ({
          month: row.month,
          effectiveType: row.effectiveType,
          spending: Number(row.spending),
        }));
      },
      /**
       * Individual debit charges (date, raw merchant, spend magnitude) over a half-open range
       * `[from, to)` — the per-charge input to recurring/subscription detection (#100). Unlike
       * {@link monthlyMerchantSpend} this does not aggregate: the pure detector needs each charge to
       * judge monthly cadence and amount similarity. Credits, excluded rows, detected transfer legs,
       * and the not-bucketed / split ("") effective type — `coalesce(override, classified)`, so a
       * manual Override to "" counts too — are excluded (a split payment isn't a subscription);
       * pending rows (null type) are kept. Reads the Own share via `effectiveAmount` (ADR-0014).
       * Scoped to the household on both the transactions filter and the override join.
       */
      merchantCharges: (range: { from: string; to: string }) =>
        db
          .select({
            date: transactions.date,
            merchant: transactions.merchant,
            amount: transactions.effectiveAmount,
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
              eq(transactions.excluded, false),
              isNull(transactions.transferGroupId),
              sql`coalesce(${overrides.expenseType}, ${transactions.expenseType}) is distinct from ''`,
              gte(transactions.date, range.from),
              lt(transactions.date, range.to)
            )
          ),
      /**
       * Per-calendar-month, per-raw-merchant debit magnitude over a half-open range `[from, to)` —
       * the input to the "biggest movers" (merchant) computation. Credits and out-of-range rows are
       * excluded; the pure layer normalises + re-aggregates. Transactions whose effective type
       * (`coalesce(override, classified)`) is "" — the not-bucketed / split type — are excluded, so a
       * split-payment merchant never surfaces as a spend mover. Scoped to the household.
       */
      monthlyMerchantSpend: async (range: { from: string; to: string }) => {
        const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
        // Own share, not the full charge, on a Shared expense (ADR-0014); equal for ordinary rows.
        const spending = sql<string>`sum(-${transactions.effectiveAmount})`;
        const rows = await db
          .select({ month, merchant: transactions.merchant, spending })
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
              // Excluded rows are not spending (ADR-0011).
              eq(transactions.excluded, false),
              // Neither is a detected inter-account transfer leg — it's money movement, not spend (#97).
              isNull(transactions.transferGroupId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to),
              sql`coalesce(${overrides.expenseType}, ${transactions.expenseType}) is distinct from ''`
            )
          )
          .groupBy(month, transactions.merchant)
          .orderBy(asc(month));
        return rows.map((row) => ({
          month: row.month,
          merchant: row.merchant,
          spending: Number(row.spending),
        }));
      },
      /**
       * The single largest counted charge over a half-open range `[from, to)` — the dashboard hero's
       * "largest charge this cycle" info line. Ranks and reports by the Own share on a Shared expense
       * (effective_amount), not the full charge, so the spending hero stays consistent (ADR-0014).
       * Returns the merchant plus the spend magnitude (positive), or `undefined` when the range has no
       * debits. Transactions whose effective type (`coalesce(override, classified)`) is "" — the
       * not-bucketed type — are excluded. Scoped to the household.
       */
      largestCharge: async (range: { from: string; to: string }) => {
        const [row] = await db
          .select({ merchant: transactions.merchant, amount: transactions.effectiveAmount })
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
              // Excluded rows are not spending (ADR-0011).
              eq(transactions.excluded, false),
              // Neither is a detected inter-account transfer leg — it's money movement, not spend (#97).
              isNull(transactions.transferGroupId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to),
              sql`coalesce(${overrides.expenseType}, ${transactions.expenseType}) is distinct from ''`
            )
          )
          .orderBy(asc(transactions.effectiveAmount))
          .limit(1);
        return row ? { merchant: row.merchant, amount: -row.amount } : undefined;
      },
      /**
       * Total debit magnitude per Account (with its name) over a half-open range `[from, to)` — the
       * account-breakdown module. Inner-joins `accounts` (household-scoped on both sides), excludes
       * credits and out-of-range rows, and groups by account. Transactions whose effective type
       * (`coalesce(override, classified)`) is "" — the not-bucketed / split type — are excluded, so a
       * split charge never inflates an account total. Accounts with no debits in the range simply
       * don't appear. `sum(...)` is coerced from the driver string. Scoped to the household.
       */
      /**
       * Signed net movement per Account over a half-open range `[from, to)` — `sum(amount)` grouped
       * by account, for the balance check (#98). Unlike {@link spendByAccount} this is the RAW signed
       * amount of EVERY row (credits, excluded rows, and transfer legs included): a statement balance
       * reflects all real money movement, not just counted spend. Inner-joins `accounts` so only
       * accounts with rows in the range appear. `sum(...)` comes back as a string; coerced to a number.
       */
      netByAccount: async (range: { from: string; to: string }) => {
        const net = sql<string>`coalesce(sum(${transactions.amount}), 0)`;
        const rows = await db
          .select({ accountId: accounts.id, name: accounts.name, net })
          .from(transactions)
          .innerJoin(
            accounts,
            and(eq(accounts.householdId, householdId), eq(accounts.id, transactions.accountId))
          )
          .where(
            and(
              eq(transactions.householdId, householdId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to)
            )
          )
          .groupBy(accounts.id, accounts.name);
        return rows.map((row) => ({ accountId: row.accountId, name: row.name, net: Number(row.net) }));
      },
      spendByAccount: async (range: { from: string; to: string }) => {
        // Own share, not the full charge, on a Shared expense (ADR-0014); equal for ordinary rows.
        const spending = sql<string>`sum(-${transactions.effectiveAmount})`;
        const rows = await db
          .select({ accountId: accounts.id, name: accounts.name, spending })
          .from(transactions)
          .innerJoin(
            accounts,
            and(
              eq(accounts.householdId, householdId),
              eq(accounts.id, transactions.accountId)
            )
          )
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
              // Excluded rows are not spending (ADR-0011).
              eq(transactions.excluded, false),
              // Neither is a detected inter-account transfer leg — it's money movement, not spend (#97).
              isNull(transactions.transferGroupId),
              gte(transactions.date, range.from),
              lt(transactions.date, range.to),
              sql`coalesce(${overrides.expenseType}, ${transactions.expenseType}) is distinct from ''`
            )
          )
          .groupBy(accounts.id, accounts.name);
        return rows.map((row) => ({
          accountId: row.accountId,
          name: row.name,
          spending: Number(row.spending),
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
       * (`"YYYY-MM"`) that still has at least one expense (`amount < 0`, no manual override) worth
       * reviewing — either not yet AI-classified, or classified below {@link REVIEW_CONFIDENCE_CEILING}
       * — with how many, newest-first. Drives where the transactions view lands by
       * default (the newest month that still has work) and the Rapid review badge total (the sum of the
       * counts). Anti-join on `overrides` (`isNull(overrides.id)`) plus the status filter, mirroring the
       * queue itself, so the badge total equals the number of cards {@link reviewQueue} will present.
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
              // An Excluded row is settled: it counts for nothing, so it needs no review (ADR-0011).
              eq(transactions.excluded, false),
              // Worth reviewing = still unclassified, OR classified but below the confidence ceiling
              // (a weak AI guess). `lt` is null-safe: credits/pending have null confidence and
              // deterministic merchant rules sit at 1, so neither slips in via the second disjunct.
              or(
                ne(transactions.classificationStatus, "classified"),
                lt(transactions.confidence, REVIEW_CONFIDENCE_CEILING)
              ),
              isNull(overrides.id)
            )
          )
          .groupBy(month)
          .orderBy(desc(month))
        return rows.map((row) => ({ month: row.month, count: row.value }))
      },
      /**
       * The whole-household rapid-review queue: every expense (`amount < 0`, no manual override) worth
       * reviewing — unclassified (pending/failed) or classified below the confidence ceiling — across all statement
       * cycles, in the same row shape as {@link listWithOverrides} so `<ReviewMode>` consumes it
       * directly. Rows the AI classified confidently (>= the ceiling) are settled and stay out; a
       * low-confidence classification is surfaced alongside the unclassified backlog. Newest-first.
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
            // Carried so the row shape stays identical to listWithOverrides for <ReviewMode>; a
            // queued debit may already be a Shared expense (ADR-0014).
            ownShareAmount: transactions.ownShareAmount,
            // Always false here (the queue is debits only) but selected so the row shape stays
            // identical to listWithOverrides for <ReviewMode>.
            incomeMarked: transactions.incomeMarked,
            // Always false / null here (excluded rows are filtered out below) but selected to keep
            // the row shape identical to listWithOverrides for <ReviewMode>.
            excluded: transactions.excluded,
            exclusionNote: transactions.exclusionNote,
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
              // An Excluded row is settled: it counts for nothing, so it needs no review (ADR-0011).
              eq(transactions.excluded, false),
              // Worth reviewing = still unclassified, OR classified but below the confidence ceiling
              // (a weak AI guess). `lt` is null-safe: credits/pending have null confidence and
              // deterministic merchant rules sit at 1, so neither slips in via the second disjunct.
              or(
                ne(transactions.classificationStatus, "classified"),
                lt(transactions.confidence, REVIEW_CONFIDENCE_CEILING)
              ),
              isNull(overrides.id)
            )
          )
          .orderBy(desc(transactions.date), asc(transactions.id))
        return limit === undefined ? q : q.limit(limit)
      },
      /**
       * Per-(merchant, type) tallies for the Classification reuse seed (ADR-0012): for every
       * confident (`confidence >= minConfidence`) genuine model classification, the count and top
       * confidence, grouped by raw merchant and Expense type. Deterministic/derived rows (credits,
       * Merchant rules, prior reuses — {@link DERIVED_REASONS}) are excluded so reuse counts only
       * real model decisions and can't reinforce itself; rows with a null reasoning are treated as
       * genuine (older model rows predating the markers). The caller normalizes merchants and picks
       * the majority — see `buildReuseSeed`.
       */
      reuseTallies: (minConfidence: number) =>
        db
          .select({
            merchant: transactions.merchant,
            expenseType: transactions.expenseType,
            n: count(),
            maxConfidence: max(transactions.confidence),
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, householdId),
              eq(transactions.classificationStatus, "classified"),
              isNotNull(transactions.expenseType),
              gte(transactions.confidence, minConfidence),
              or(
                isNull(transactions.reasoning),
                notInArray(transactions.reasoning, DERIVED_REASONS)
              )
            )
          )
          .groupBy(transactions.merchant, transactions.expenseType),
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
      /**
       * Count of transactions still awaiting classification — same predicate as {@link listPending}
       * (pending, manual overrides excluded), so it counts exactly what a drain would attempt.
       * Drives the dashboard's "Classify pending" affordance.
       */
      countPending: async () => {
        const [row] = await db
          .select({ value: count() })
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
      /**
       * Mark (or unmark) a credit as real income (ADR-0009). Scoped to the household and to
       * credits (`amount > 0`) — a debit id updates nothing (returns []) rather than tripping the
       * DB CHECK, so callers can 404/409 on an empty result. Also guards `excluded = false`: Income
       * and Excluded are mutually exclusive (ADR-0011), so an excluded row updates nothing here too —
       * closing the race where a concurrent exclude between the route's read and this write would
       * otherwise trip the `NOT (excluded AND income_marked)` CHECK with an unhandled 500.
       */
      setIncomeMarked: (id: string, incomeMarked: boolean) =>
        db
          .update(transactions)
          .set({ incomeMarked })
          .where(
            and(
              eq(transactions.id, id),
              eq(transactions.householdId, householdId),
              gt(transactions.amount, 0),
              eq(transactions.excluded, false)
            )
          )
          .returning(),
      /**
       * Exclude (or re-include) a Transaction from every calculation (ADR-0011). Scoped to the
       * household. Any sign qualifies — unlike income marking. Excluding clears `incomeMarked` AND
       * any Own share (excluding drops the whole row, so a partial Shared expense can't coexist —
       * ADR-0014; both would otherwise trip a DB CHECK) and stores the optional `note`; re-including
       * clears the note. A missing id updates nothing (returns []), so the caller can 404 on empty.
       */
      setExcluded: (id: string, excluded: boolean, note?: string | null) =>
        db
          .update(transactions)
          .set(
            excluded
              ? {
                  excluded: true,
                  incomeMarked: false,
                  ownShareAmount: null,
                  exclusionNote: note ?? null,
                }
              : { excluded: false, exclusionNote: null }
          )
          .where(
            and(eq(transactions.id, id), eq(transactions.householdId, householdId))
          )
          .returning(),
      /**
       * Link two Transactions as the legs of one detected inter-account transfer (issue #97): they
       * receive a shared, freshly-minted group id and are dropped from every spend/income
       * aggregation. Atomic and tenant-safe — the read and write run in one `db.transaction`, and
       * both ids must resolve to distinct, **not-yet-linked** rows in this Household or nothing is
       * written (returns `rows: []`). This rejects a cross-tenant id, a self-pair, and re-linking a
       * leg that already belongs to another pair (which would orphan its old partner), so no
       * half-linked or overwritten leg can result. Detection ({@link detectTransferPairs}) supplies
       * the pairing.
       */
      markTransferPair: (fromId: string, toId: string) => {
        const groupId = crypto.randomUUID();
        return db
          .transaction(async (tx) => {
            const rows = await tx
              .update(transactions)
              .set({ transferGroupId: groupId })
              .where(
                and(
                  eq(transactions.householdId, householdId),
                  inArray(transactions.id, [fromId, toId]),
                  // Guard on the UPDATE itself — one atomic check-and-set. Only unlinked rows match,
                  // so an already-linked group id is never overwritten even if a concurrent pairing
                  // commits between statements (READ COMMITTED would let a separate SELECT go stale).
                  isNull(transactions.transferGroupId)
                )
              )
              .returning();
            // Both legs must be present and unlinked; anything else (cross-tenant, self-pair,
            // already-linked, or a leg deleted concurrently) rolls back so no half-linked leg lands.
            if (rows.length !== 2) tx.rollback();
            return { groupId, rows };
          })
          .catch((err) => {
            if (err instanceof TransactionRollbackError) return { groupId: null, rows: [] };
            throw err;
          });
      },
      /**
       * Set (or clear) a Transaction's Own share — the portion of a Shared expense that counts as
       * spend (ADR-0014). Scoped to the household. Setting is guarded to a non-excluded debit whose
       * share stays within the charge (`amount < 0`, `excluded = false`, `amount <= ownShareAmount`),
       * so a credit, excluded, or out-of-bounds request updates nothing (returns []) — the caller
       * 404/409s on the empty result — rather than tripping a DB CHECK with an unhandled 500. The
       * route also validates `ownShareAmount < 0`. Clearing (`null`) carries no guards and is always
       * safe, returning the row to its full charged amount.
       */
      setOwnShare: (id: string, ownShareAmount: number | null) =>
        db
          .update(transactions)
          .set({ ownShareAmount })
          .where(
            and(
              eq(transactions.id, id),
              eq(transactions.householdId, householdId),
              ...(ownShareAmount === null
                ? []
                : [
                    lt(transactions.amount, 0),
                    eq(transactions.excluded, false),
                    lte(transactions.amount, ownShareAmount),
                  ])
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
       * Re-type every non-overridden Transaction that matches the Household's current Merchant
       * rules (CONTEXT.md: adding a rule re-types all matching Transactions except those with a
       * manual Override). Existing rows — already AI-classified, failed, or still pending — pick up
       * the deterministic type immediately, without waiting for (or spending) the model. Wrapped in
       * a transaction so the per-type batch updates commit together. Returns the number re-typed.
       */
      retypeByMerchantRules: () => db.transaction((tx) => retypeMatchingRows(tx)),
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
      /**
       * Create a rule and immediately re-type existing matching rows, atomically: both run in one
       * transaction so a crash can't leave the rule created but existing rows un-retyped (and a
       * unique-merchant violation rolls the whole thing back). Returns the new rule and the count
       * of rows the rule re-typed. Used by the create route; {@link create} stays for setup paths
       * that don't need the re-type.
       */
      createAndApply: (value: Omit<typeof merchantRules.$inferInsert, "householdId">) =>
        db.transaction(async (tx) => {
          const [rule] = await tx
            .insert(merchantRules)
            .values({ ...value, householdId })
            .returning()
          if (!rule) throw new Error("merchant rule insert returned no rows")
          const retyped = await retypeMatchingRows(tx)
          return { rule, retyped }
        }),
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
    savings: {
      goal: {
        /** The household's single Savings goal, or undefined when none is set. */
        get: async () => {
          const [row] = await db
            .select()
            .from(savingsGoals)
            .where(eq(savingsGoals.householdId, householdId))
          return row
        },
        /**
         * Set (or change) the household's Savings goal. One goal per Household (unique
         * `household_id`, v1), so a second call updates the existing row in place.
         */
        upsert: (value: Omit<typeof savingsGoals.$inferInsert, "householdId">) =>
          db
            .insert(savingsGoals)
            .values({ ...value, householdId })
            .onConflictDoUpdate({
              target: savingsGoals.householdId,
              set: {
                target: value.target,
                targetDate: value.targetDate,
                startingSaved: value.startingSaved,
                startCycle: value.startCycle,
                currency: value.currency,
              },
            })
            .returning(),
      },
      incomeSources: {
        list: () =>
          db
            .select()
            .from(savingsIncomeSources)
            .where(eq(savingsIncomeSources.householdId, householdId))
            .orderBy(asc(savingsIncomeSources.createdAt), asc(savingsIncomeSources.name)),
        /**
         * Replace the household's full set of Income sources with the given list (the config
         * form saves the whole list at once). Delete + insert in one transaction, so a failed
         * save never leaves the config half-written.
         */
        replace: (
          values: Array<Omit<typeof savingsIncomeSources.$inferInsert, "householdId">>
        ) => db.transaction((tx) => swapIncomeSources(tx, values)),
      },
      offcardCosts: {
        list: () =>
          db
            .select()
            .from(savingsOffcardCosts)
            .where(eq(savingsOffcardCosts.householdId, householdId))
            .orderBy(asc(savingsOffcardCosts.createdAt), asc(savingsOffcardCosts.name)),
        /** Replace the household's full set of Off-card fixed costs; same shape as income sources. */
        replace: (
          values: Array<Omit<typeof savingsOffcardCosts.$inferInsert, "householdId">>
        ) => db.transaction((tx) => swapOffcardCosts(tx, values)),
      },
      oneOffAdjustments: {
        /** The household's per-cycle One-off adjustments (ADR-0015), oldest cycle first. */
        list: () =>
          db
            .select()
            .from(savingsOneOffAdjustments)
            .where(eq(savingsOneOffAdjustments.householdId, householdId))
            .orderBy(
              asc(savingsOneOffAdjustments.cycleKey),
              asc(savingsOneOffAdjustments.createdAt),
            ),
        /** Replace the household's full set of one-off adjustments (whole set saved at once). */
        replace: (
          values: Array<Omit<typeof savingsOneOffAdjustments.$inferInsert, "householdId">>
        ) => db.transaction((tx) => swapOneOffAdjustments(tx, values)),
      },
      /**
       * Replace the Savings-config lists in one transaction (the config form saves them
       * together), so a failure on any list rolls the whole save back — the config can never
       * commit half-updated. `oneOffAdjustments` is optional: omit it to leave the household's
       * existing one-offs untouched (a caller saving only the recurring lists); pass `[]` to clear.
       */
      replaceConfig: (
        incomeSources: Array<Omit<typeof savingsIncomeSources.$inferInsert, "householdId">>,
        offcardCosts: Array<Omit<typeof savingsOffcardCosts.$inferInsert, "householdId">>,
        oneOffAdjustments?: Array<Omit<typeof savingsOneOffAdjustments.$inferInsert, "householdId">>
      ) =>
        db.transaction(async (tx) => ({
          incomeSources: await swapIncomeSources(tx, incomeSources),
          offcardCosts: await swapOffcardCosts(tx, offcardCosts),
          oneOffAdjustments:
            oneOffAdjustments === undefined
              ? undefined
              : await swapOneOffAdjustments(tx, oneOffAdjustments),
        })),
    },
    budgets: {
      /** The household's per-category budgets (#103), stable order for display. */
      list: () =>
        db
          .select()
          .from(categoryBudgets)
          .where(eq(categoryBudgets.householdId, householdId))
          .orderBy(asc(categoryBudgets.expenseType)),
      /**
       * Replace the household's full set of category budgets with the given list (the budgets form
       * saves the whole set at once). Delete + insert in one transaction, so a failed save never
       * leaves budgets half-written.
       */
      replace: (values: Array<Omit<typeof categoryBudgets.$inferInsert, "householdId">>) =>
        db.transaction((tx) => swapCategoryBudgets(tx, values)),
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
    members: {
      /** All Members of this Household (identity name/email is resolved separately via users_sync). */
      list: () =>
        db
          .select()
          .from(members)
          .where(eq(members.householdId, householdId))
          .orderBy(asc(members.createdAt)),
      /** How many Members belong to this Household — the numerator of the seat cap (ADR-0010). */
      count: async () => {
        const [row] = await db
          .select({ value: count() })
          .from(members)
          .where(eq(members.householdId, householdId))
        return row?.value ?? 0
      },
    },
    invites: {
      /** Create a pending Invite for this Household (caller sets `email` lower-cased + a `tokenHash`). */
      create: (
        value: Omit<typeof householdInvites.$inferInsert, "householdId" | "status" | "acceptedAt">
      ) =>
        db
          .insert(householdInvites)
          .values({ ...value, householdId })
          .returning(),
      /** Active (pending, unexpired) Invites for this Household, newest first — the management list. */
      listActive: () =>
        db
          .select()
          .from(householdInvites)
          .where(
            and(
              eq(householdInvites.householdId, householdId),
              eq(householdInvites.status, "pending"),
              gt(householdInvites.expiresAt, sql`now()`)
            )
          )
          .orderBy(desc(householdInvites.createdAt)),
      /** Count of active Invites — added to Member count for the seat cap (a pending seat is reserved). */
      countActive: async () => {
        const [row] = await db
          .select({ value: count() })
          .from(householdInvites)
          .where(
            and(
              eq(householdInvites.householdId, householdId),
              eq(householdInvites.status, "pending"),
              gt(householdInvites.expiresAt, sql`now()`)
            )
          )
        return row?.value ?? 0
      },
      /** The live (pending, unexpired) Invite for an email in this Household, if any — idempotent re-invite. */
      findActiveByEmail: async (email: string) => {
        const [row] = await db
          .select()
          .from(householdInvites)
          .where(
            and(
              eq(householdInvites.householdId, householdId),
              eq(householdInvites.email, email),
              eq(householdInvites.status, "pending"),
              gt(householdInvites.expiresAt, sql`now()`)
            )
          )
        return row
      },
      /** Revoke a still-pending Invite in this Household; a non-pending / foreign id updates nothing. */
      revoke: (id: string) =>
        db
          .update(householdInvites)
          .set({ status: "revoked" })
          .where(
            and(
              eq(householdInvites.id, id),
              eq(householdInvites.householdId, householdId),
              eq(householdInvites.status, "pending")
            )
          )
          .returning(),
    },
    activity: {
      /**
       * Append one entry to the Household's Activity log (ADR-0017). Append-only: there is
       * deliberately no update/delete surface. Callers pass the actor (`memberId` + denormalized
       * `actorName` snapshot), the intent `action`, and a `payload` of entity id(s) + summary —
       * never FKs to financial rows, which a data reset may delete. Accepts an optional `tx` so a
       * mutation and its log entry commit atomically (e.g. the data reset logs itself).
       *
       * `id` and `createdAt` are intentionally NOT accepted: the timestamp is stamped by the DB
       * (`defaultNow()`) so a caller can never back-date or future-date an entry — the "when" is as
       * trustworthy as the "who" (ADR-0017 Trust).
       */
      record: (
        entry: Omit<typeof activityLog.$inferInsert, "householdId" | "id" | "createdAt">,
        tx: DbOrTx = db,
      ) =>
        tx
          .insert(activityLog)
          .values({ ...entry, householdId })
          .returning(),
      /** This Household's whole log, newest first — every Member reads it (ADR-0017 transparency). */
      list: () =>
        db
          .select()
          .from(activityLog)
          .where(eq(activityLog.householdId, householdId))
          .orderBy(desc(activityLog.createdAt)),
    },
  }
}

export type HouseholdRepo = ReturnType<typeof householdRepo>
