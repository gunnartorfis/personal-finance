import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { accounts, merchantRules, transactions, uploads } from "./schema";
import type * as schema from "./schema";

/**
 * Household-scoped data access (ADR-0002).
 *
 * The tenant boundary is the Household, so application code must never query across households.
 * This repository binds a `householdId` once and scopes every read and write to it: list queries
 * filter by `household_id`, and inserts stamp it (callers cannot pass a different one — it is
 * omitted from the insert types). The schema's composite foreign keys provide a second line of
 * defence at the database, so a mis-scoped reference is rejected even if the app layer slips.
 *
 * Works with any drizzle database bound to the schema (the live Neon pool, or pglite in tests).
 */

// The application database, bound to this schema. Tests pass a pglite-backed database cast to
// this type — the query surface used here (select/insert) is identical across drivers.
type Db = NodePgDatabase<typeof schema>;

type NewAccount = Omit<typeof accounts.$inferInsert, "householdId">;
type NewUpload = Omit<typeof uploads.$inferInsert, "householdId">;
type NewTransaction = Omit<typeof transactions.$inferInsert, "householdId">;
type NewMerchantRule = Omit<typeof merchantRules.$inferInsert, "householdId">;

/** Build a data-access surface scoped to a single Household. */
export function householdRepo(db: Db, householdId: string) {
  return {
    accounts: {
      list: () => db.select().from(accounts).where(eq(accounts.householdId, householdId)),
      create: (value: NewAccount) =>
        db.insert(accounts).values({ ...value, householdId }).returning(),
    },
    uploads: {
      list: () => db.select().from(uploads).where(eq(uploads.householdId, householdId)),
      create: (value: NewUpload) =>
        db.insert(uploads).values({ ...value, householdId }).returning(),
    },
    transactions: {
      list: () => db.select().from(transactions).where(eq(transactions.householdId, householdId)),
      create: (value: NewTransaction) =>
        db.insert(transactions).values({ ...value, householdId }).returning(),
    },
    merchantRules: {
      list: () => db.select().from(merchantRules).where(eq(merchantRules.householdId, householdId)),
      create: (value: NewMerchantRule) =>
        db.insert(merchantRules).values({ ...value, householdId }).returning(),
    },
  };
}

export type HouseholdRepo = ReturnType<typeof householdRepo>;
