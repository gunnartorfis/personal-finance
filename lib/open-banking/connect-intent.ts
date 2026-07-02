import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { bankConnectionIntents } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

/** Works with the live Neon pool or pglite in tests. */
type Db = NodePgDatabase<typeof schema>;

/**
 * CSRF cookie name for the connect flow: set at connect-start, matched against the echoed `state` in
 * the callback. Lives here (not the connect route) so the callback can import it without dragging in
 * the connect route's auth/provider imports.
 */
export const STATE_COOKIE = "ob_connect_state";

/** What the callback recovers from a `state` to complete a connection without the auth session. */
export interface ConnectIntent {
  householdId: string;
  institutionName: string | null;
}

/**
 * Record the household (and chosen institution) for an in-flight bank connection, keyed by the OAuth
 * `state` (#119 fix). The connect-start request has the interactive session; the cross-site callback
 * doesn't, so it recovers identity from here instead of `requireHousehold`. Not tenant-scoped — the
 * callback has no household until this lookup — but the `state` is unguessable, so a row can't be
 * forged for another household.
 */
export async function recordConnectIntent(
  db: Db,
  intent: { state: string; householdId: string; institutionName?: string },
): Promise<void> {
  await db.insert(bankConnectionIntents).values({
    state: intent.state,
    householdId: intent.householdId,
    institutionName: intent.institutionName ?? null,
  });
}

/**
 * Resolve and delete the intent for a `state`. Single-use: a replayed callback finds nothing and is
 * rejected. Returns null when the state is unknown/expired/already consumed.
 */
export async function consumeConnectIntent(db: Db, state: string): Promise<ConnectIntent | null> {
  const [row] = await db
    .delete(bankConnectionIntents)
    .where(eq(bankConnectionIntents.state, state))
    .returning();
  if (!row) return null;
  return { householdId: row.householdId, institutionName: row.institutionName };
}
