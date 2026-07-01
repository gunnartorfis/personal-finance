import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  integer,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Database schema (ADR-0002: Household is the tenant boundary).
 *
 * Every financial row is keyed by `household_id`. Cross-table references additionally use
 * COMPOSITE foreign keys that include `household_id`, so a child row can only reference a parent
 * in the same household — tenant isolation is enforced by the database, not just the app layer.
 */

/** A Household's subscription level (ADR-0002/0006). */
export const planEnum = pgEnum("plan", ["Free", "Premium"]);

/**
 * The tenant: a couple or family sharing one financial picture. Holds the Plan (ADR-0006) and the
 * single billing currency used for all net math (ADR-0004: one billing currency per Household in
 * v1, so it lives here rather than per-Account).
 */
export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plan: planEnum("plan").notNull().default("Free"),
    /** When the Premium plan next renews; null on Free. */
    planRenewsAt: timestamp("plan_renews_at", { withTimezone: true }),
    /** ISO 4217 billing currency; the charged amount is the sole source of truth for net math. */
    billingCurrency: text("billing_currency").notNull().default("ISK"),
    /** Adyen recurringDetailReference (stored card token) for renewal charges; null until set. */
    straumurRecurringDetailReference: text("straumur_recurring_detail_reference"),
    /** Billing period of the active subscription; drives the renewal amount + cadence. Null on Free. */
    subscriptionPeriod: text("subscription_period"),
    /** Consecutive failed renewal charges; drives dunning. Reset to 0 on success / downgrade. */
    renewalFailureCount: integer("renewal_failure_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A Free household never carries a renewal date (prevents stray charges / dunning on Free).
    check("households_free_has_no_renewal", sql`${t.plan} <> 'Free' OR ${t.planRenewsAt} IS NULL`),
    // Likewise a Free household carries no subscription period. NOTE: any downgrade to Free (cancel
    // / dunning) MUST null subscriptionPeriod (and planRenewsAt) in the same UPDATE, or this CHECK
    // rejects it — the symmetry of activation, which sets both together.
    check("households_free_has_no_period", sql`${t.plan} <> 'Free' OR ${t.subscriptionPeriod} IS NULL`),
    // The subscription period, when set, is one of the known billing periods.
    check(
      "households_subscription_period_valid",
      sql`${t.subscriptionPeriod} IS NULL OR ${t.subscriptionPeriod} IN ('monthly', 'annual')`,
    ),
    // Billing currency is a normalized ISO 4217 code: exactly three uppercase letters.
    check("households_billing_currency_iso4217", sql`${t.billingCurrency} ~ '^[A-Z]{3}$'`),
  ],
);

/** A signed-in user belonging to a Household, linked to a Stack Auth user (ADR-0001/0002). */
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** The Stack Auth user id this Member maps to. */
    authUserId: text("auth_user_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Target for composite same-household foreign keys from upload/override actor columns.
  (t) => [unique("members_household_id_id_key").on(t.householdId, t.id)],
);

/** The lifecycle/health of a Bank connection's PSD2 consent (open-banking auto-sync). */
export const bankConnectionStatusEnum = pgEnum("bank_connection_status", [
  "active",
  "expiring",
  "expired",
  "error",
  "revoked",
]);

/**
 * A Household's authorized link to one bank via an open-banking aggregator (Enable Banking). Holds
 * the PSD2 consent (which expires — SCA re-consent ~every 90 days) and the aggregator tokens
 * (encrypted at rest by the app layer). One connection exposes one or more {@link accounts}.
 */
export const bankConnections = pgTable(
  "bank_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** The aggregator, e.g. "enable_banking". */
    provider: text("provider").notNull(),
    /** The aggregator's consent/session id for this connection. */
    providerConnectionId: text("provider_connection_id").notNull(),
    /** Bank identifier + display name from the aggregator (e.g. "LANDSBANKINN"). */
    institutionId: text("institution_id"),
    institutionName: text("institution_name"),
    status: bankConnectionStatusEnum("status").notNull().default("active"),
    /** When the PSD2 consent expires and SCA re-consent is required. */
    consentExpiresAt: timestamp("consent_expires_at", { withTimezone: true }),
    /** Aggregator access/refresh tokens; ciphertext (encrypted at rest by the app layer). */
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Target for the composite same-household FK from accounts.
    unique("bank_connections_household_id_id_key").on(t.householdId, t.id),
    // One connection per (provider, consent) within a Household.
    unique("bank_connections_household_provider_conn_key").on(
      t.householdId,
      t.provider,
      t.providerConnectionId,
    ),
  ],
);

/**
 * A card or bank account within a Household; the provenance of every Transaction (ADR-0004).
 * Its billing currency is the Household's (one per Household in v1), so it is not stored here.
 *
 * Every Household is provisioned with exactly one `isDefault` account (see
 * `lib/household/default-account.ts`); it is the pre-selected pick in the upload flow and the only
 * account when a Household hasn't added its own. The partial unique index enforces at-most-one
 * default per Household.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    /** The Bank connection this account was discovered through; null for manual/CSV accounts. */
    connectionId: uuid("connection_id"),
    /** The aggregator's account id, for synced accounts; null for manual/CSV. */
    externalAccountId: text("external_account_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Target for composite same-household foreign keys from uploads/transactions.
    unique("accounts_household_id_id_key").on(t.householdId, t.id),
    // At most one default account per Household.
    uniqueIndex("accounts_one_default_per_household")
      .on(t.householdId)
      .where(sql`${t.isDefault}`),
    // A synced Account's Bank connection must belong to the same Household (NO ACTION: the app
    // nulls connectionId / revokes rather than deleting a connection, so historical rows survive).
    foreignKey({
      columns: [t.householdId, t.connectionId],
      foreignColumns: [bankConnections.householdId, bankConnections.id],
      name: "accounts_connection_household_fk",
    }),
  ],
);

/** The lifecycle of a Transaction's classification (ADR-0005). */
export const classificationStatusEnum = pgEnum("classification_status", [
  "pending",
  "classified",
  "failed",
]);

/** Where a Transaction came from: a CSV {@link uploads} import, or an automatic bank sync. */
export const ingestionSourceEnum = pgEnum("ingestion_source", ["csv", "bank_sync"]);

/** One CSV import into a Household: the file, the Account its rows belong to, and the importer. */
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    /** The Member who uploaded (same Household); nulled by the app if they leave (ADR-0002). */
    importedByMemberId: uuid("imported_by_member_id"),
    fileName: text("file_name").notNull(),
    /** SHA-256 of the raw bytes — the exact-file import guard (ADR-0003). */
    fileHash: text("file_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The Account must belong to the same Household as the Upload.
    foreignKey({
      columns: [t.householdId, t.accountId],
      foreignColumns: [accounts.householdId, accounts.id],
      name: "uploads_account_household_fk",
    }).onDelete("cascade"),
    // The importer Member must belong to the same Household (NO ACTION: a household-wide
    // cascade still succeeds; deleting a lone Member requires the app to null this first).
    foreignKey({
      columns: [t.householdId, t.importedByMemberId],
      foreignColumns: [members.householdId, members.id],
      name: "uploads_importer_household_fk",
    }),
    // Target for the composite same-household FK from transactions.
    unique("uploads_household_id_id_key").on(t.householdId, t.id),
    // One import of a given file per Household (the exact-file guard, enforced at the DB).
    unique("uploads_household_id_file_hash_key").on(t.householdId, t.fileHash),
  ],
);

/**
 * One line from an Upload (ADR-0003/0004/0005). Append-only with a DB-generated PK; `sourceRow`
 * keeps the CSV row index for traceability. `amount` is the charged amount in the Household's
 * billing currency (the sole source of truth); `originalAmount`/`originalCurrency` are the foreign
 * pre-conversion amount, display-only. Classification is drained asynchronously.
 */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    /** The CSV Upload this row came from; null for synced (bank_sync) rows. */
    uploadId: uuid("upload_id"),
    /** Ingestion provenance: a CSV Upload or an automatic bank sync. */
    source: ingestionSourceEnum("source").notNull().default("csv"),
    /** The aggregator's stable transaction id, for synced rows; null for CSV. The dedup key. */
    externalId: text("external_id"),
    date: date("date").notNull(),
    /** Charged amount in the Household's billing currency; negative = expense. */
    amount: integer("amount").notNull(),
    /** Foreign pre-conversion amount, display-only; never summed into net. */
    originalAmount: numeric("original_amount"),
    originalCurrency: text("original_currency"),
    merchant: text("merchant").notNull(),
    rawCategory: text("raw_category").notNull(),
    /** CSV row index for traceability; null for synced rows (which use externalId instead). */
    sourceRow: integer("source_row"),
    classificationStatus: classificationStatusEnum("classification_status")
      .notNull()
      .default("pending"),
    /** Expense type once classified ("" = not bucketed); null while pending/failed. */
    expenseType: text("expense_type"),
    confidence: real("confidence"),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A row has an Expense type iff it is classified ("" counts); pending/failed carry none.
    check(
      "transactions_classified_has_type",
      sql`(${t.classificationStatus} = 'classified') = (${t.expenseType} IS NOT NULL)`,
    ),
    // Expense type, when set, is one of the known buckets ("" = not bucketed).
    check(
      "transactions_expense_type_valid",
      sql`${t.expenseType} IS NULL OR ${t.expenseType} IN ('Fixed', 'Necessary', 'Nice to have', '')`,
    ),
    // A foreign original amount and its currency are present together or not at all.
    check(
      "transactions_original_amount_currency",
      sql`(${t.originalAmount} IS NULL) = (${t.originalCurrency} IS NULL)`,
    ),
    // The Account and Upload must belong to the same Household as the Transaction.
    foreignKey({
      columns: [t.householdId, t.accountId],
      foreignColumns: [accounts.householdId, accounts.id],
      name: "transactions_account_household_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.householdId, t.uploadId],
      foreignColumns: [uploads.householdId, uploads.id],
      name: "transactions_upload_household_fk",
    }).onDelete("cascade"),
    // Provenance integrity: a CSV row carries an Upload and no external id; a synced row carries an
    // external id and no Upload.
    check(
      "transactions_source_provenance",
      sql`(${t.source} = 'csv' AND ${t.uploadId} IS NOT NULL AND ${t.externalId} IS NULL)
        OR (${t.source} = 'bank_sync' AND ${t.uploadId} IS NULL AND ${t.externalId} IS NOT NULL)`,
    ),
    // Idempotent dedup for synced rows: one row per (household, account, provider transaction id).
    // Partial so CSV rows (external id null) are unconstrained.
    uniqueIndex("transactions_household_account_external_key")
      .on(t.householdId, t.accountId, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    // Target for the composite same-household FK from overrides.
    unique("transactions_household_id_id_key").on(t.householdId, t.id),
  ],
);

/** A Member's manual Expense-type change to a Transaction; overrides the classified type. */
export const overrides = pgTable(
  "overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Keyed off the real Transaction PK (ADR-0003); one override per Transaction. */
    transactionId: uuid("transaction_id").notNull().unique(),
    /** The Member who made the override (same Household); nulled by the app if they leave. */
    memberId: uuid("member_id"),
    expenseType: text("expense_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "overrides_expense_type_valid",
      sql`${t.expenseType} IN ('Fixed', 'Necessary', 'Nice to have', '')`,
    ),
    // The Transaction must belong to the same Household as the Override.
    foreignKey({
      columns: [t.householdId, t.transactionId],
      foreignColumns: [transactions.householdId, transactions.id],
      name: "overrides_transaction_household_fk",
    }).onDelete("cascade"),
    // The actor Member must belong to the same Household (NO ACTION; see uploads importer note).
    foreignKey({
      columns: [t.householdId, t.memberId],
      foreignColumns: [members.householdId, members.id],
      name: "overrides_member_household_fk",
    }),
  ],
);

/**
 * A household-level deterministic mapping from a (normalized) merchant to an Expense type,
 * applied before AI classification (ADR-0005, `CONTEXT.md`). `merchant` stores the normalized
 * key (see `shared/merchant-rules.ts`). A rule is either FLAT (`flatType`) or a SPLIT by charge
 * magnitude (`threshold` + `atOrAboveType`/`belowType`) — exactly one shape, enforced by CHECK.
 */
export const merchantRules = pgTable(
  "merchant_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Normalized merchant key this rule matches. */
    merchant: text("merchant").notNull(),
    /** Flat rule: the Expense type to assign. Null for split rules. */
    flatType: text("flat_type"),
    /** Split rule: charge-magnitude threshold (`|amount| >= threshold`). Null for flat rules. */
    threshold: integer("threshold"),
    atOrAboveType: text("at_or_above_type"),
    belowType: text("below_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One rule per normalized merchant per Household.
    unique("merchant_rules_household_id_merchant_key").on(t.householdId, t.merchant),
    // Exactly one shape: flat (only flatType) XOR split (threshold + both branch types).
    check(
      "merchant_rules_one_shape",
      sql`(
        ${t.flatType} IS NOT NULL AND ${t.threshold} IS NULL
          AND ${t.atOrAboveType} IS NULL AND ${t.belowType} IS NULL
      ) OR (
        ${t.flatType} IS NULL AND ${t.threshold} IS NOT NULL
          AND ${t.atOrAboveType} IS NOT NULL AND ${t.belowType} IS NOT NULL
      )`,
    ),
    // Every set type column is one of the known buckets ("" = not bucketed).
    check(
      "merchant_rules_types_valid",
      sql`(${t.flatType} IS NULL OR ${t.flatType} IN ('Fixed', 'Necessary', 'Nice to have', ''))
        AND (${t.atOrAboveType} IS NULL OR ${t.atOrAboveType} IN ('Fixed', 'Necessary', 'Nice to have', ''))
        AND (${t.belowType} IS NULL OR ${t.belowType} IN ('Fixed', 'Necessary', 'Nice to have', ''))`,
    ),
    // A split threshold is a positive magnitude (0 would make the at-or-above branch always fire).
    check("merchant_rules_threshold_positive", sql`${t.threshold} IS NULL OR ${t.threshold} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// straumurPayments — webhook-sourced Straumur/Adyen payment records (ADR-0006)
// ---------------------------------------------------------------------------
// Authoritative record of `Authorization` (and related) events received via Straumur's payment
// webhook. The session status poll returns only a coarse status; pspReference, amount, currency,
// and the recurring token arrive here. Idempotent on pspReference: re-receiving the same event
// patches the existing row rather than inserting a duplicate.
//
// The webhook is externally sourced, so `householdId` is a best-effort parse of our own
// merchantReference (`sub_{householdId}_…`) and is intentionally nullable and unconstrained — an
// unrecognised reference is still recorded for diagnostics rather than rejected.
export const straumurPayments = pgTable("straumur_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id"),
  pspReference: text("psp_reference").notNull().unique(),
  merchantReference: text("merchant_reference"),
  checkoutReference: text("checkout_reference"),
  /** Adyen recurringDetailReference / stored token, when present — used for renewal charges. */
  recurringDetailReference: text("recurring_detail_reference"),
  amount: integer("amount").notNull(), // minor units, as received from the webhook
  currency: text("currency").notNull(),
  success: boolean("success").notNull(),
  eventCode: text("event_code").notNull(),
  reason: text("reason"),
  rawEvent: text("raw_event"), // capped diagnostic copy of the payload
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Savings goals (ADR-0007): a Household tracks progress toward a target amount by a target date,
// with progress INFERRED from spend (never an entered balance). These tables hold the goal, the
// Household's configured Monthly income + Off-card fixed costs, and the frozen per-cycle Check-in
// snapshots. Every row is keyed by household_id (cascade); none reference another tenant-scoped
// table, so a plain household FK is sufficient (no composite same-household FK needed here).
// ---------------------------------------------------------------------------

/** A Household's Savings goal (ADR-0007). One active goal per Household in v1. */
export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Amount to accumulate by the target date, in whole billing-currency units. */
    target: integer("target").notNull(),
    /** The date the amount must be reached by. */
    targetDate: date("target_date").notNull(),
    /** Amount already saved at the start cycle (0 when starting from scratch). */
    startingSaved: integer("starting_saved").notNull().default(0),
    /** Statement-cycle key (`YYYY-MM`) the goal starts counting from. */
    startCycle: text("start_cycle").notNull(),
    /** ISO 4217 goal currency (the Household's billing currency; no FX in v1). */
    currency: text("currency").notNull().default("ISK"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One active Savings goal per Household (v1).
    unique("savings_goals_household_id_key").on(t.householdId),
    check("savings_goals_target_positive", sql`${t.target} > 0`),
    check("savings_goals_starting_saved_nonneg", sql`${t.startingSaved} >= 0`),
    // Start cycle is a well-formed Statement-cycle key: YYYY-MM, month 01–12.
    check("savings_goals_start_cycle_format", sql`${t.startCycle} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("savings_goals_currency_iso4217", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    // The target date must fall after the start cycle begins — a goal cannot be already expired at
    // creation, which would drive cyclesRemaining <= 0 in the downstream savings math.
    check(
      "savings_goals_target_after_start_cycle",
      sql`${t.targetDate} > to_date(${t.startCycle} || '-01', 'YYYY-MM-DD')`,
    ),
  ],
);

/** A recurring monthly income source for a Household's savings math (e.g. a salary, rental income). */
export const savingsIncomeSources = pgTable(
  "savings_income_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Monthly amount in whole billing-currency units. */
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("savings_income_sources_amount_nonneg", sql`${t.amount} >= 0`)],
);

/** A recurring monthly Off-card fixed cost (rent, loan) not present on the uploaded cards (ADR-0007). */
export const savingsOffcardCosts = pgTable(
  "savings_offcard_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Monthly amount in whole billing-currency units. */
    monthlyAmount: integer("monthly_amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("savings_offcard_costs_monthly_amount_nonneg", sql`${t.monthlyAmount} >= 0`)],
);

/**
 * A frozen Check-in snapshot for one Statement cycle (ADR-0007): the cycle's inputs and the
 * resulting Inferred saving, captured at check-in so later config edits never rewrite history.
 * One Check-in per (Household, cycle).
 */
export const savingsCheckins = pgTable(
  "savings_checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Statement-cycle key (`YYYY-MM`) this snapshot covers. */
    cycleKey: text("cycle_key").notNull(),
    /** Frozen recurring Monthly income for the cycle. */
    monthlyIncome: integer("monthly_income").notNull(),
    /** Frozen one-off extra income for the cycle (bonus, gift); 0 when none. */
    cycleExtra: integer("cycle_extra").notNull().default(0),
    /** Frozen Off-card fixed costs for the cycle. */
    offCardFixed: integer("off_card_fixed").notNull(),
    /** Frozen card debits (magnitude; positive card lines excluded, ADR-0007). */
    cardDebits: integer("card_debits").notNull(),
    /** Frozen Inferred saving; may be negative on a losing cycle. */
    inferredSaving: integer("inferred_saving").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One Check-in per Household per cycle (re-checking a cycle upserts this row).
    unique("savings_checkins_household_id_cycle_key").on(t.householdId, t.cycleKey),
    check("savings_checkins_cycle_key_format", sql`${t.cycleKey} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("savings_checkins_monthly_income_nonneg", sql`${t.monthlyIncome} >= 0`),
    check("savings_checkins_cycle_extra_nonneg", sql`${t.cycleExtra} >= 0`),
    check("savings_checkins_off_card_fixed_nonneg", sql`${t.offCardFixed} >= 0`),
    check("savings_checkins_card_debits_nonneg", sql`${t.cardDebits} >= 0`),
    // Defence in depth: the frozen Inferred saving reconciles with its inputs (ADR-0007 formula).
    check(
      "savings_checkins_inferred_reconciles",
      sql`${t.inferredSaving} = ${t.monthlyIncome} + ${t.cycleExtra} - ${t.offCardFixed} - ${t.cardDebits}`,
    ),
  ],
);
