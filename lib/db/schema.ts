import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Database schema (ADR-0002: Household is the tenant boundary).
 *
 * Every financial row is keyed by `household_id`. This module currently covers the tenant and
 * identity tables (Household + Plan + billing currency, Member, Account); ingestion/classification
 * tables (Upload, Transaction, Override) and MerchantRule are added in later schema slices.
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
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  /** The Stack Auth user id this Member maps to. */
  authUserId: text("auth_user_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A card or bank account within a Household; the provenance of every Transaction (ADR-0004).
 * Its billing currency is the Household's (one per Household in v1), so it is not stored here.
 */
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The lifecycle of a Transaction's classification (ADR-0005). */
export const classificationStatusEnum = pgEnum("classification_status", [
  "pending",
  "classified",
  "failed",
]);

/** One CSV import into a Household: the file, the Account its rows belong to, and the importer. */
export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  /** The Member who uploaded; nulls out if they leave (the Household's data stays, ADR-0002). */
  importedByMemberId: uuid("imported_by_member_id").references(() => members.id, {
    onDelete: "set null",
  }),
  fileName: text("file_name").notNull(),
  /** SHA-256 of the raw bytes — the exact-file import guard (ADR-0003). */
  fileHash: text("file_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    uploadId: uuid("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
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
    transactionId: uuid("transaction_id")
      .notNull()
      .unique()
      .references(() => transactions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    expenseType: text("expense_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "overrides_expense_type_valid",
      sql`${t.expenseType} IN ('Fixed', 'Necessary', 'Nice to have', '')`,
    ),
  ],
);
