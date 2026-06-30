import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { households } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

/** Works with the live Neon pool or pglite in tests. */
type Db = NodePgDatabase<typeof schema>;

/** Consecutive failed renewal charges before a Household is downgraded (ADR-0006). */
export const MAX_RENEWAL_ATTEMPTS = 3;

/** Whether a Household should be downgraded after this many consecutive failed charges. */
export function shouldDowngrade(failureCount: number): boolean {
  return failureCount >= MAX_RENEWAL_ATTEMPTS;
}

/**
 * Drop a Household to Free, clearing all subscription state in one UPDATE (plan, renewal date,
 * period, stored token, failure count) so the `households_free_has_no_renewal` /
 * `households_free_has_no_period` CHECKs are satisfied. Used by both dunning (exhausted retries) and
 * an explicit cancel. Idempotent.
 */
export async function downgradeToFree(db: Db, householdId: string): Promise<void> {
  await db
    .update(households)
    .set({
      plan: "Free",
      planRenewsAt: null,
      subscriptionPeriod: null,
      straumurRecurringDetailReference: null,
      renewalFailureCount: 0,
    })
    .where(eq(households.id, householdId));
}
