import { eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import { members } from "@/lib/db/schema"
import type * as schema from "@/lib/db/schema"

/**
 * Set a Member's Digest subscription (#102, ADR-0019). `subscribed: false` stamps
 * `digest_unsubscribed_at` (opt-out); `true` clears it (re-subscribe). Used by both the auth-less
 * unsubscribe link and the settings toggle. Keyed by Member id alone — the unsubscribe link carries
 * no Household context, and a Member id is globally unique.
 */
type Db = NodePgDatabase<typeof schema>

export async function setDigestSubscription(db: Db, memberId: string, subscribed: boolean): Promise<void> {
  await db
    .update(members)
    .set({ digestUnsubscribedAt: subscribed ? null : new Date() })
    .where(eq(members.id, memberId))
}
