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
    const repo = householdRepo(db, household.id);
    try {
      const res = await syncActiveConnections({
        repo,
        provider,
        now,
        classify: () => drainHousehold(repo, classifier, household.plan),
      });
      inserted += res.inserted;
      failed += res.failed;
      // Drain unconditionally: a prior run may have inserted rows then crashed before classifying,
      // leaving them pending on a day with no new transactions (where syncActiveConnections skips
      // its inserted-gated classify). drainPending short-circuits on an empty queue, so the extra
      // call is a no-op when everything is already classified.
      await drainHousehold(repo, classifier, household.plan);
    } catch (err) {
      // syncActiveConnections isolates per-connection internally, so this only fires on an
      // unexpected household-level error; count it and keep the batch going.
      failed += 1;
      console.error(`[open-banking cron] household ${household.id} sync failed`, err);
    }
  }

  return { households: due.length, inserted, failed };
}
