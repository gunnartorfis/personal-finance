import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
