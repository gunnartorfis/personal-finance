import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { households } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

/** Works with the live Neon pool or pglite in tests. */
type Db = NodePgDatabase<typeof schema>;

/** A Premium household due to be charged, with everything the charge needs. */
export interface RenewableHousehold {
  id: string;
  subscriptionPeriod: string;
  token: string;
  billingCurrency: string;
  planRenewsAt: Date;
  renewalFailureCount: number;
}

/**
 * Premium households whose renewal is due (`planRenewsAt <= now`) and that have a stored token and
 * period to charge. System-wide (the renewal cron is not tenant-scoped); Free households and those
 * missing a token/period are excluded.
 */
export async function dueForRenewal(db: Db, now: Date): Promise<RenewableHousehold[]> {
  const rows = await db
    .select({
      id: households.id,
      subscriptionPeriod: households.subscriptionPeriod,
      token: households.straumurRecurringDetailReference,
      billingCurrency: households.billingCurrency,
      planRenewsAt: households.planRenewsAt,
      renewalFailureCount: households.renewalFailureCount,
    })
    .from(households)
    .where(
      and(
        eq(households.plan, "Premium"),
        lte(households.planRenewsAt, now),
        isNotNull(households.straumurRecurringDetailReference),
        isNotNull(households.subscriptionPeriod),
      ),
    );

  // The WHERE guarantees these are present; narrow the nullable column types for callers.
  return rows.flatMap((row) =>
    row.subscriptionPeriod && row.token && row.planRenewsAt
      ? [
          {
            id: row.id,
            subscriptionPeriod: row.subscriptionPeriod,
            token: row.token,
            billingCurrency: row.billingCurrency,
            planRenewsAt: row.planRenewsAt,
            renewalFailureCount: row.renewalFailureCount,
          },
        ]
      : [],
  );
}
