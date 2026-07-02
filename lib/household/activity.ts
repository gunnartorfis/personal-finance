import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  accounts,
  bankConnections,
  householdInvites,
  members,
  merchantRules,
  savingsGoals,
  transactions,
  uploads,
} from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

/**
 * "Has this Household actually been used?" — the signal that decides how loudly to warn a member who
 * is about to switch Households by accepting an Invite (ADR-0010).
 *
 * A freshly auto-provisioned Household is a lone Member and a single default account and nothing
 * else; discarding it costs nothing. Once it has transactions, imports, a linked bank, extra
 * accounts, savings, rules, a second Member, or an outstanding Invite, deleting it is destructive and
 * the user must be warned clearly. `memberCount` also decides the exit: sole Member ⇒ delete the
 * Household; others remain ⇒ just leave it.
 */
type Db = NodePgDatabase<typeof schema>;

export interface HouseholdActivity {
  /** Current Members of the Household. */
  memberCount: number;
  /** True once the Household holds anything worth losing (see module doc). */
  hasActivity: boolean;
}

export async function getHouseholdActivity(db: Db, householdId: string): Promise<HouseholdActivity> {
  const exists = async (
    table: typeof transactions | typeof uploads | typeof bankConnections | typeof accounts | typeof savingsGoals | typeof merchantRules | typeof householdInvites,
    where: ReturnType<typeof and> | ReturnType<typeof eq>,
  ): Promise<boolean> => {
    const rows = await db.select({ one: sql<number>`1` }).from(table).where(where).limit(1);
    return rows.length > 0;
  };

  const [memberRow, hasTransactions, hasUploads, hasBank, hasExtraAccounts, hasSavings, hasRules, hasPendingInvite] =
    await Promise.all([
      db.select({ value: sql<number>`count(*)::int` }).from(members).where(eq(members.householdId, householdId)),
      exists(transactions, eq(transactions.householdId, householdId)),
      exists(uploads, eq(uploads.householdId, householdId)),
      exists(bankConnections, eq(bankConnections.householdId, householdId)),
      // The default account is created with the Household, so only a non-default one counts as use.
      exists(accounts, and(eq(accounts.householdId, householdId), eq(accounts.isDefault, false))),
      exists(savingsGoals, eq(savingsGoals.householdId, householdId)),
      exists(merchantRules, eq(merchantRules.householdId, householdId)),
      exists(householdInvites, and(eq(householdInvites.householdId, householdId), eq(householdInvites.status, "pending"))),
    ]);

  return {
    memberCount: memberRow[0]?.value ?? 0,
    hasActivity:
      hasTransactions || hasUploads || hasBank || hasExtraAccounts || hasSavings || hasRules || hasPendingInvite,
  };
}
