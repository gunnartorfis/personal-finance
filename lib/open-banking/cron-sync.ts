import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { type Classifier, drainPending } from "@/lib/classification/worker";
import { householdRepo } from "@/lib/db/household-repo";
import { bankConnections, households } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import type { Plan } from "@/shared/types";

import type { IngestionProvider } from "./provider";
import { syncActiveConnections } from "./sync";

/** Works with the live Neon pool or pglite in tests. */
type Db = NodePgDatabase<typeof schema>;

/** Classification runs in bounded batches so one household's drain can't exhaust the cron budget. */
const CLASSIFY_BATCH = 25;
/** Safety bound on the drain loop (CLASSIFY_BATCH × this = max txns classified per household per run). */
const MAX_DRAIN_BATCHES = 400;

export interface CronSyncResult {
  /** Households that had at least one active connection to sync. */
  households: number;
  /** New synced transactions inserted across all households. */
  inserted: number;
  /** Connections (or whole households) whose sync failed — flagged, not fatal. */
  failed: number;
}

/**
 * Drain a household's pending queue to completion in bounded batches (the classify route drains one
 * batch per request and relies on re-invocation; the cron owns the whole drain). Stops as soon as a
 * batch classifies nothing new — so Free-capped rows left pending don't spin the loop.
 */
async function drainHousehold(
  repo: ReturnType<typeof householdRepo>,
  classifier: Classifier,
  plan: Plan,
): Promise<void> {
  for (let i = 0; i < MAX_DRAIN_BATCHES; i++) {
    const { classified, failed } = await drainPending(repo, classifier, { plan, limit: CLASSIFY_BATCH });
    if (classified === 0 && failed === 0) return;
  }
}

/**
 * Sync one household's active connections and drain its classification queue to completion — the unit
 * of work shared by the daily cron (looped over every due household) and the on-link initial sync
 * (#146, one household, session-authed). `syncActiveConnections` isolates per-connection failures
 * internally and only classifies when it inserted rows; the trailing unconditional drain flushes rows
 * a prior run inserted then crashed before classifying (a no-op on an empty queue). Not tenant-scoped
 * itself — the caller passes a `householdId` it is authorized for.
 */
export async function syncHousehold(params: {
  db: Db;
  householdId: string;
  plan: Plan;
  provider: IngestionProvider;
  now: Date;
  classifier: Classifier;
}): Promise<{ inserted: number; failed: number }> {
  const { db, householdId, plan, provider, now, classifier } = params;
  const repo = householdRepo(db, householdId);
  const res = await syncActiveConnections({
    repo,
    provider,
    now,
    classify: () => drainHousehold(repo, classifier, plan),
  });
  await drainHousehold(repo, classifier, plan);
  return { inserted: res.inserted, failed: res.failed };
}

/**
 * System-wide daily open-banking sync (#115). For every household with an active connection, pull
 * new transactions incrementally and drain classification. Household- and connection-level failures
 * are isolated (a broken consent flags that connection `error` and is counted) so one bad connection
 * never stops the batch. `classifier` is injected so tests need no model; the cron route passes the
 * real Sonnet classifier. Secured upstream by the cron secret (see the route). Not tenant-scoped.
 */
export async function syncDueConnections(params: {
  db: Db;
  provider: IngestionProvider;
  now: Date;
  classifier: Classifier;
}): Promise<CronSyncResult> {
  const { db, provider, now, classifier } = params;

  // Distinct households that have at least one active connection (join collapses multiple per household).
  const due = await db
    .selectDistinct({ id: households.id, plan: households.plan })
    .from(bankConnections)
    .innerJoin(households, eq(households.id, bankConnections.householdId))
    .where(eq(bankConnections.status, "active"));

  let inserted = 0;
  let failed = 0;
  for (const household of due) {
    try {
      const res = await syncHousehold({
        db,
        householdId: household.id,
        plan: household.plan,
        provider,
        now,
        classifier,
      });
      inserted += res.inserted;
      failed += res.failed;
    } catch (err) {
      // syncHousehold isolates per-connection failures internally, so this only fires on an
      // unexpected household-level error; count it and keep the batch going.
      failed += 1;
      console.error(`[open-banking cron] household ${household.id} sync failed`, err);
    }
  }

  return { households: due.length, inserted, failed };
}
