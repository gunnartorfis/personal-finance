import { eq, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { bankConnectionIntents } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

/** Works with the live Neon pool or pglite in tests. */
type Db = NodePgDatabase<typeof schema>;

/**
 * How long an intent stays valid — a little longer than the CSRF cookie's 10-minute `maxAge` so a
 * legitimate but slow SCA still resolves. Expired rows never resolve and are swept on the next start.
 */
const INTENT_TTL_MS = 15 * 60 * 1000;

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
  // Sweep expired intents (abandoned flows, bank-error/denied returns, closed tabs) so this handshake
  // table can't grow unbounded — there's no cron for it, and those paths never consume their row.
  await db
    .delete(bankConnectionIntents)
    .where(lt(bankConnectionIntents.createdAt, new Date(Date.now() - INTENT_TTL_MS)));
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
  // Delete by state regardless (so a stale row is cleaned even when rejected), but only resolve one
  // created within the TTL — an expired state is treated as unknown.
  const cutoff = new Date(Date.now() - INTENT_TTL_MS);
  const [row] = await db
    .delete(bankConnectionIntents)
    .where(eq(bankConnectionIntents.state, state))
    .returning();
  if (!row) {
    // Diagnostic: distinguishes "row was never written / already consumed" from "expired" below.
    console.warn("[ob:intent] no row for state (never recorded, or already consumed)");
    return null;
  }
  if (row.createdAt < cutoff) {
    console.warn("[ob:intent] row expired", { ageMs: Date.now() - row.createdAt.getTime() });
    return null;
  }
  return { householdId: row.householdId, institutionName: row.institutionName };
}
