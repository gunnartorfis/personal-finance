import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Database schema (ADR-0002: Household is the tenant boundary).
 *
 * This module establishes the root tenant table; the remaining tables (Member, Account, Upload,
 * Transaction, Override, MerchantRule, and the Plan fields on Household) are added in the Schema
 * piece. Every financial row will be keyed by `household_id`.
 */

/** The tenant: a couple or family sharing one financial picture. */
export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
