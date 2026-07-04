import { sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import type * as schema from "@/lib/db/schema"
import { toLocale, type Locale } from "@/lib/i18n/config"

/**
 * Who should receive the Monthly Digest (#102, ADR-0019). A Member is eligible when they are
 * subscribed (`digest_unsubscribed_at IS NULL`), have a non-deleted identity with an email, and that
 * email is **verified** — read from Neon Auth's `neon_auth.users_sync` mirror, where verification
 * lives in `raw_json->>'primary_email_verified'` (there is no dedicated column). The cron has no
 * session, so this is the only place verification can come from. Grouped by Household so the caller
 * loads each Household's view-model once.
 */
type Db = NodePgDatabase<typeof schema>

export interface DigestRecipient {
  memberId: string
  email: string
  /** The Member's Locale, or null when unset (caller falls back to the default). */
  locale: Locale | null
}

export interface HouseholdDigestRecipients {
  householdId: string
  members: DigestRecipient[]
}

export async function listDigestRecipients(db: Db): Promise<HouseholdDigestRecipients[]> {
  const { rows } = await db.execute<{
    household_id: string
    member_id: string
    locale: string | null
    email: string
  }>(sql`
    select m.household_id, m.id as member_id, m.locale, u.email
    from members m
    join neon_auth.users_sync u on u.id = m.auth_user_id
    where m.digest_unsubscribed_at is null
      and u.deleted_at is null
      and u.email is not null
      -- String compare (not ::boolean): a malformed value must exclude the row, never throw and
      -- abort the whole cron run for every recipient.
      and u.raw_json->>'primary_email_verified' = 'true'
    order by m.household_id, m.created_at asc
  `)

  // Rows arrive ordered by household; fold consecutive rows into per-household groups.
  const byHousehold = new Map<string, DigestRecipient[]>()
  for (const row of rows) {
    const member: DigestRecipient = {
      memberId: row.member_id,
      email: row.email,
      // Locale is stored as free text (schema note); validate at this boundary via toLocale, so a
      // stale/unknown value (e.g. "fr") degrades to null (caller's default) rather than a lying cast.
      locale: toLocale(row.locale),
    }
    const existing = byHousehold.get(row.household_id)
    if (existing) existing.push(member)
    else byHousehold.set(row.household_id, [member])
  }

  return [...byHousehold].map(([householdId, members]) => ({ householdId, members }))
}
