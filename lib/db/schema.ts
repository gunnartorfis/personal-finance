import { sql } from "drizzle-orm";
import {
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A Free household never carries a renewal date (prevents stray charges / dunning on Free).
    check("households_free_has_no_renewal", sql`${t.plan} <> 'Free' OR ${t.planRenewsAt} IS NULL`),
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

/**
 * A card or bank account within a Household; the provenance of every Transaction (ADR-0004).
 * Its billing currency is the Household's (one per Household in v1), so it is not stored here.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Target for composite same-household foreign keys from uploads/transactions.
  (t) => [unique("accounts_household_id_id_key").on(t.householdId, t.id)],
);

/** The lifecycle of a Transaction's classification (ADR-0005). */
export const classificationStatusEnum = pgEnum("classification_status", [
  "pending",
  "classified",
  "failed",
]);

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
    uploadId: uuid("upload_id").notNull(),
    date: date("date").notNull(),
    /** Charged amount in the Household's billing currency; negative = expense. */
    amount: integer("amount").notNull(),
    /** Foreign pre-conversion amount, display-only; never summed into net. */
    originalAmount: numeric("original_amount"),
    originalCurrency: text("original_currency"),
    merchant: text("merchant").notNull(),
    rawCategory: text("raw_category").notNull(),
    sourceRow: integer("source_row").notNull(),
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
