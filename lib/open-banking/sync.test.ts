import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import type { IngestionProvider, ProviderTransaction } from "./provider";
import { mapProviderTransaction, syncActiveConnections, syncConnection } from "./sync";

let db: ReturnType<typeof drizzle>;
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function freshHousehold() {
  const [h] = await db.insert(households).values({}).returning();
  return householdRepo(asRepoDb(db), h.id);
}

/** Provider stub: records the ranges it was asked for; returns scripted transactions per account uid. */
function recordingProvider(byUid: Record<string, ProviderTransaction[]>) {
  const ranges: Array<{ uid: string; from: string; to: string }> = [];
  const provider: IngestionProvider = {
    name: "mock",
    listInstitutions: async () => [],
    startAuth: async () => ({ url: "", authorizationId: "" }),
    authorizeSession: async () => ({ sessionId: "", accounts: [], consentValidUntil: "" }),
    getSession: async () => ({ status: "AUTHORIZED", consentValidUntil: "" }),
    listTransactions: async (uid, range) => {
      ranges.push({ uid, ...range });
      return byUid[uid] ?? [];
    },
  };
  return { provider, ranges };
}

const tx = (externalId: string, amount: number): ProviderTransaction => ({
  externalId,
  date: "2026-03-01",
  amount,
  currency: "ISK",
  merchant: "SHOP",
  reference: null,
});

const NOW = new Date("2026-03-15T00:00:00Z");
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

async function connectionWithAccount(repo: Awaited<ReturnType<typeof freshHousehold>>) {
  const [conn] = await repo.bankConnections.create({
    provider: "mock",
    providerConnectionId: `c-${Math.round(NOW.getTime())}-${Math.random()}`,
  });
  const [account] = await repo.accounts.create({
    name: "Debit",
    connectionId: conn.id,
    externalAccountId: "uid-a",
  });
  return { conn, account };
}

describe("mapProviderTransaction", () => {
  it("maps to a synced insert with a rounded amount and empty raw category", () => {
    expect(mapProviderTransaction(tx("t1", -1990.4), "acc-1")).toEqual({
      accountId: "acc-1",
      source: "bank_sync",
      externalId: "t1",
      date: "2026-03-01",
      amount: -1990,
      merchant: "SHOP",
      rawCategory: "",
    });
  });
});

describe("syncConnection", () => {
  it("backfills over the default window and inserts pending synced rows", async () => {
    const repo = await freshHousehold();
    const { conn } = await connectionWithAccount(repo);
    const { provider, ranges } = recordingProvider({ "uid-a": [tx("t1", -1990), tx("t2", 5000)] });

    const res = await syncConnection({ repo, provider, connection: conn, now: NOW });
    expect(res.inserted).toBe(2);

    const rows = await repo.transactions.list();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === "bank_sync" && r.classificationStatus === "pending")).toBe(true);
    // First sync backfills from now − 730d to now.
    expect(ranges[0]).toEqual({
      uid: "uid-a",
      from: isoDate(new Date(NOW.getTime() - 730 * 86_400_000)),
      to: isoDate(NOW),
    });
    // lastSyncedAt advanced.
    expect((await repo.bankConnections.findById(conn.id))?.lastSyncedAt).not.toBeNull();
  });

  it("is idempotent — a re-sync of overlapping data inserts nothing new", async () => {
    const repo = await freshHousehold();
    const { conn } = await connectionWithAccount(repo);
    const { provider } = recordingProvider({ "uid-a": [tx("t1", -1990), tx("t2", 5000)] });

    await syncConnection({ repo, provider, connection: conn, now: NOW });
    const fresh = await repo.bankConnections.findById(conn.id);
    const again = await syncConnection({
      repo,
      provider,
      connection: { id: conn.id, lastSyncedAt: fresh!.lastSyncedAt },
      now: NOW,
    });
    expect(again.inserted).toBe(0);
    expect(await repo.transactions.list()).toHaveLength(2);
  });

  it("syncs incrementally from lastSyncedAt once set", async () => {
    const repo = await freshHousehold();
    const { conn } = await connectionWithAccount(repo);
    const { provider, ranges } = recordingProvider({ "uid-a": [] });
    const lastSyncedAt = new Date("2026-03-10T00:00:00Z");

    await syncConnection({ repo, provider, connection: { id: conn.id, lastSyncedAt }, now: NOW });
    expect(ranges[0].from).toBe("2026-03-10");
    expect(ranges[0].to).toBe(isoDate(NOW));
  });
});

describe("syncActiveConnections", () => {
  it("syncs active connections and triggers classify once when rows were inserted", async () => {
    const repo = await freshHousehold();
    await connectionWithAccount(repo);
    const { provider } = recordingProvider({ "uid-a": [tx("t1", -1990)] });
    const classify = vi.fn().mockResolvedValue(undefined);

    const res = await syncActiveConnections({ repo, provider, now: NOW, classify });
    expect(res).toEqual({ connections: 1, inserted: 1 });
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("skips non-active connections and does not classify when nothing was inserted", async () => {
    const repo = await freshHousehold();
    const [conn] = await repo.bankConnections.create({ provider: "mock", providerConnectionId: "revoked" });
    await repo.bankConnections.update(conn.id, { status: "revoked" });
    const { provider } = recordingProvider({});
    const classify = vi.fn().mockResolvedValue(undefined);

    const res = await syncActiveConnections({ repo, provider, now: NOW, classify });
    expect(res.connections).toBe(0);
    expect(classify).not.toHaveBeenCalled();
  });
});
