import { and, eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import type { CycleKey } from "@/lib/dashboard/cycle"
import { digestSends } from "@/lib/db/schema"
import type * as schema from "@/lib/db/schema"

/**
 * The append-only Digest send-ledger (#102, ADR-0019): the DB side of the cron's at-most-once
 * guarantee. `digestSendExists` is the pre-send dedup; `recordDigestSend` marks a delivered send and
 * is a no-op on the (member, cycle) unique constraint, so a retried/double-fired run never re-sends.
 */
type Db = NodePgDatabase<typeof schema>

export async function digestSendExists(db: Db, memberId: string, cycleKey: CycleKey): Promise<boolean> {
  const rows = await db
    .select({ id: digestSends.id })
    .from(digestSends)
    .where(and(eq(digestSends.memberId, memberId), eq(digestSends.cycleKey, cycleKey)))
    .limit(1)
  return rows.length > 0
}

export async function recordDigestSend(
  db: Db,
  householdId: string,
  memberId: string,
  cycleKey: CycleKey,
): Promise<void> {
  // No-op on the (member_id, cycle_key) unique constraint — a retried run must not error or duplicate.
  await db.insert(digestSends).values({ householdId, memberId, cycleKey }).onConflictDoNothing()
}
