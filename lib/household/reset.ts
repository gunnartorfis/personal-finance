import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { accounts, merchantRules, overrides, transactions, uploads } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

import { DEFAULT_ACCOUNT_NAME } from "./default-account";

/**
 * Wipe a Household's entire financial dataset.
 *
 * Deletes every uploaded statement, transaction, manual override, account, and merchant rule for
 * `householdId`, then re-creates the single default account so the Household lands back in the exact
 * just-provisioned state (ADR-0004: every Household always has a default account). The Household
 * itself, its members, and its plan/billing are intentionally kept — this resets the *data*, not the
 * tenant.
 *
 * Access is gated by `isHouseholdResetEnabled()` (see `lib/household/reset-availability.ts`); this
 * function performs no authorization of its own, so callers MUST scope `householdId` to the current
 * tenant.
 *
 * Runs in a single transaction so a reset is all-or-nothing. Rows are deleted child-first; the
 * schema's `ON DELETE CASCADE` foreign keys would also propagate these deletes, but doing it
 * explicitly keeps the wipe correct regardless of future cascade changes and makes the scope obvious.
 */
type Db = NodePgDatabase<typeof schema>;

export async function resetHouseholdFinancialData(db: Db, householdId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(overrides).where(eq(overrides.householdId, householdId));
    await tx.delete(transactions).where(eq(transactions.householdId, householdId));
    await tx.delete(uploads).where(eq(uploads.householdId, householdId));
    await tx.delete(accounts).where(eq(accounts.householdId, householdId));
    await tx.delete(merchantRules).where(eq(merchantRules.householdId, householdId));
    // Restore the default account so the Household never exists without one.
    await tx
      .insert(accounts)
      .values({ householdId, name: DEFAULT_ACCOUNT_NAME, isDefault: true });
  });
}
