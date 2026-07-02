import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "@/lib/db/schema";

/**
 * Member identity for the household screen (ADR-0010).
 *
 * Names/emails are NOT stored on `members` — the Neon Auth best practice is to read them from the
 * `neon_auth.users_sync` table Neon mirrors auth users into, joined on `auth_user_id`. If that
 * table isn't enabled on the project the join throws; we fall back to identity-less rows so the
 * screen still renders (Members show as "Member" with no email) rather than 500ing.
 */
type Db = NodePgDatabase<typeof schema>;

export interface MemberIdentity {
  id: string;
  authUserId: string;
  name: string | null;
  email: string | null;
  createdAt: Date;
}

export async function listMembersWithIdentity(db: Db, householdId: string): Promise<MemberIdentity[]> {
  try {
    const result = await db.execute<{
      id: string;
      auth_user_id: string;
      name: string | null;
      email: string | null;
      created_at: Date;
    }>(sql`
      select m.id, m.auth_user_id, m.created_at, u.name, u.email
      from members m
      left join neon_auth.users_sync u on u.id = m.auth_user_id
      where m.household_id = ${householdId}
      order by m.created_at asc
    `);
    return result.rows.map((r) => ({
      id: r.id,
      authUserId: r.auth_user_id,
      name: r.name,
      email: r.email,
      createdAt: r.created_at,
    }));
  } catch {
    // users_sync not available — return Members without identity so the page still works.
    const result = await db.execute<{ id: string; auth_user_id: string; created_at: Date }>(sql`
      select id, auth_user_id, created_at
      from members
      where household_id = ${householdId}
      order by created_at asc
    `);
    return result.rows.map((r) => ({
      id: r.id,
      authUserId: r.auth_user_id,
      name: null,
      email: null,
      createdAt: r.created_at,
    }));
  }
}
