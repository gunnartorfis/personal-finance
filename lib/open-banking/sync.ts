import type { HouseholdRepo } from "@/lib/db/household-repo";
import type { transactions } from "@/lib/db/schema";

import type { IngestionProvider, ProviderTransaction } from "./provider";

/** How far back the first sync of a connection reaches (bank-capped in practice). */
const DEFAULT_BACKFILL_DAYS = 730;

type SyncedInsert = Omit<typeof transactions.$inferInsert, "householdId">;

/** ISO `YYYY-MM-DD` in UTC — the format the aggregator range params and the `date` column use. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Map an aggregator transaction to a synced Transaction insert (Phase K, #114). The amount is rounded
 * to the Household's whole-unit billing currency (ADR-0004: ISK, no minor units); `rawCategory` is
 * empty (the aggregator supplies none). Pure.
 */
export function mapProviderTransaction(
  pt: ProviderTransaction,
  accountId: string,
): SyncedInsert {
  return {
    accountId,
    source: "bank_sync",
    externalId: pt.externalId,
    date: pt.date,
    amount: Math.round(pt.amount),
    merchant: pt.merchant,
    rawCategory: "",
  };
}

/**
 * Sync one Bank connection: for each of its accounts, pull the aggregator's transactions over the
 * window (full backfill on the first sync, incremental from `lastSyncedAt` thereafter), dedup-insert
 * them, and advance `lastSyncedAt`. Returns the count of genuinely new rows. Dedup is by
 * `(household, account, externalId)` so an overlapping window never duplicates.
 */
export async function syncConnection(params: {
  repo: HouseholdRepo;
  provider: IngestionProvider;
  connection: { id: string; lastSyncedAt: Date | null };
  now: Date;
  backfillDays?: number;
}): Promise<{ inserted: number }> {
  const { repo, provider, connection, now } = params;
  const backfillDays = params.backfillDays ?? DEFAULT_BACKFILL_DAYS;
  const from = connection.lastSyncedAt
    ? isoDate(connection.lastSyncedAt)
    : isoDate(new Date(now.getTime() - backfillDays * 86_400_000));
  const to = isoDate(now);

  const accounts = await repo.accounts.listByConnection(connection.id);
  let inserted = 0;
  for (const account of accounts) {
    if (!account.externalAccountId) continue;
    const pts = await provider.listTransactions(account.externalAccountId, { from, to });
    const rows = pts.map((pt) => mapProviderTransaction(pt, account.id));
    const newRows = await repo.transactions.createSyncedMany(rows);
    inserted += newRows.length;
  }
  await repo.bankConnections.update(connection.id, { lastSyncedAt: now });
  return { inserted };
}

/**
 * Sync every active Bank connection for the Household, then trigger classification once (injected —
 * required — so tests need no model and a production caller can't forget the mandatory next step and
 * silently strand rows in `pending`). Each connection is isolated: a provider failure (e.g. expired
 * consent) flags that connection `error` and is counted, without aborting the rest of the batch.
 * Drives the connect backfill and the daily cron (#115).
 */
export async function syncActiveConnections(params: {
  repo: HouseholdRepo;
  provider: IngestionProvider;
  now: Date;
  classify: () => Promise<unknown>;
  backfillDays?: number;
}): Promise<{ connections: number; inserted: number; failed: number }> {
  const { repo, provider, now, classify, backfillDays } = params;
  const connections = await repo.bankConnections.listActive();
  let inserted = 0;
  let failed = 0;
  for (const connection of connections) {
    try {
      const res = await syncConnection({ repo, provider, connection, now, backfillDays });
      inserted += res.inserted;
    } catch (err) {
      failed += 1;
      console.error(`open-banking sync failed for connection ${connection.id}`, err);
      // Flag the connection so the reconnect UI (#116) can surface it; best-effort.
      await repo.bankConnections.update(connection.id, { status: "error" }).catch(() => {});
    }
  }
  if (inserted > 0) await classify();
  return { connections: connections.length, inserted, failed };
}
