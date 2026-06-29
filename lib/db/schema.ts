import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Database schema (ADR-0002: Household is the tenant boundary).
 *
 * Every financial row is keyed by `household_id`. This module currently covers the tenant and
 * identity tables (Household + Plan fields, Member, Account); ingestion/classification tables
 * (Upload, Transaction, Override) and MerchantRule are added in later schema slices.
 */

/** A Household's subscription level (ADR-0002/0006). */
export const planEnum = pgEnum("plan", ["Free", "Premium"]);

/** The tenant: a couple or family sharing one financial picture. Holds the Plan (ADR-0006). */
export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  plan: planEnum("plan").notNull().default("Free"),
  /** When the Premium plan next renews; null on Free. */
  planRenewsAt: timestamp("plan_renews_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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

/** A card or bank account within a Household; the provenance of every Transaction (ADR-0004). */
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** ISO 4217 billing currency; the charged amount is in this currency (one per Household in v1). */
  billingCurrency: text("billing_currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
