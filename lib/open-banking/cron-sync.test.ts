import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import type { Classifier } from "@/lib/classification/worker";
import { households } from "@/lib/db/schema";

import type { IngestionProvider, ProviderTransaction } from "./provider";
import { syncDueConnections, syncHousehold } from "./cron-sync";

let db: ReturnType<typeof drizzle>;
const asRepoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
const asCronDb = (d: typeof db) => d as unknown as Parameters<typeof syncDueConnections>[0]["db"];

// A fresh db per test: syncDueConnections is system-wide, so households must not leak between cases.
beforeEach(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

const NOW = new Date("2026-03-15T00:00:00Z");

const tx = (externalId: string, amount: number): ProviderTransaction => ({
  externalId,
  date: "2026-03-01",
  amount,
  currency: "ISK",
  merchant: "SHOP",
  reference: null,
});

/** Provider stub returning scripted transactions per account uid; a uid of "boom" throws. */
function scriptedProvider(byUid: Record<string, ProviderTransaction[]>): IngestionProvider {
  return {
    name: "mock",
    listInstitutions: async () => [],
    startAuth: async () => ({ url: "", authorizationId: "" }),
    authorizeSession: async () => ({ sessionId: "", accounts: [], consentValidUntil: "" }),
    getSession: async () => ({ status: "AUTHORIZED", consentValidUntil: "" }),
    deleteSession: async () => {},
    listTransactions: async (uid) => {
      if (uid === "boom") throw new Error("consent expired");
      return byUid[uid] ?? [];
    },
  };
}

/** Bucket every expense into one type — no model, so the drain is deterministic in tests. */
const stubClassifier: Classifier = async () => ({ expenseType: "Necessary" });

async function premiumHousehold() {
  const [h] = await db.insert(households).values({ plan: "Premium" }).returning();
  return { id: h.id, repo: householdRepo(asRepoDb(db), h.id) };
}

async function activeConnectionWithAccount(
  repo: Awaited<ReturnType<typeof premiumHousehold>>["repo"],
  uid: string,
) {
  const [conn] = await repo.bankConnections.create({
    provider: "mock",
    providerConnectionId: `c-${uid}`,
  });
  await repo.accounts.create({ name: uid, connectionId: conn.id, externalAccountId: uid });
  return conn;
}

describe("syncDueConnections (daily cron core)", () => {
  it("syncs every household with an active connection, drains classification, and aggregates counts", async () => {
    const a = await premiumHousehold();
    const b = await premiumHousehold();
    await activeConnectionWithAccount(a.repo, "uid-a");
    await activeConnectionWithAccount(b.repo, "uid-b");
    const provider = scriptedProvider({
      "uid-a": [tx("a1", -1990), tx("a2", -500)],
      "uid-b": [tx("b1", -3000)],
    });
    const classifier = vi.fn(stubClassifier);

    const res = await syncDueConnections({ db: asCronDb(db), provider, now: NOW, classifier });

    expect(res).toEqual({ households: 2, inserted: 3, failed: 0 });
    // The classify drain ran: no synced row is left pending.
    const pendingA = (await a.repo.transactions.list()).filter((t) => t.classificationStatus === "pending");
    const pendingB = (await b.repo.transactions.list()).filter((t) => t.classificationStatus === "pending");
    expect(pendingA).toHaveLength(0);
    expect(pendingB).toHaveLength(0);
    expect(classifier).toHaveBeenCalled();
  });

  it("drains rows stranded pending by a prior run even when no new transactions arrive", async () => {
    // Simulate a prior cron that inserted rows but crashed before classifying them.
    const h = await premiumHousehold();
    const conn = await activeConnectionWithAccount(h.repo, "uid-s");
    const [account] = await h.repo.accounts.listByConnection(conn.id);
    await h.repo.transactions.createSyncedMany([
      { accountId: account.id, source: "bank_sync", externalId: "stranded1", date: "2026-02-01", amount: -750, merchant: "SHOP", rawCategory: "" },
    ]);
    expect((await h.repo.transactions.list()).every((t) => t.classificationStatus === "pending")).toBe(true);

    // Today's sync finds nothing new (inserted === 0).
    const provider = scriptedProvider({ "uid-s": [] });
    const res = await syncDueConnections({
      db: asCronDb(db),
      provider,
      now: NOW,
      classifier: vi.fn(stubClassifier),
    });

    expect(res.inserted).toBe(0);
    // The stranded row is still flushed.
    const pending = (await h.repo.transactions.list()).filter((t) => t.classificationStatus === "pending");
    expect(pending).toHaveLength(0);
  });

  it("ignores households whose only connection is not active", async () => {
    const dormant = await premiumHousehold();
    const conn = await activeConnectionWithAccount(dormant.repo, "uid-d");
    await dormant.repo.bankConnections.update(conn.id, { status: "revoked" });
    const provider = scriptedProvider({ "uid-d": [tx("d1", -100)] });

    const res = await syncDueConnections({
      db: asCronDb(db),
      provider,
      now: NOW,
      classifier: vi.fn(stubClassifier),
    });

    expect(res.households).toBe(0);
    expect(res.inserted).toBe(0);
  });

  it("isolates a household whose provider fails and still syncs the rest (via syncHousehold)", async () => {
    const ok = await premiumHousehold();
    const broken = await premiumHousehold();
    await activeConnectionWithAccount(ok.repo, "uid-ok");
    await activeConnectionWithAccount(broken.repo, "boom");
    const provider = scriptedProvider({ "uid-ok": [tx("ok1", -1000)] });

    const res = await syncDueConnections({
      db: asCronDb(db),
      provider,
      now: NOW,
      classifier: vi.fn(stubClassifier),
    });

    expect(res.households).toBe(2);
    expect(res.inserted).toBe(1);
    expect(res.failed).toBe(1);
  });
});

describe("syncHousehold (single household, shared by cron + on-link initial sync #146)", () => {
  it("syncs the household's active connections and drains its classification queue", async () => {
    const h = await premiumHousehold();
    await activeConnectionWithAccount(h.repo, "uid-x");
    const provider = scriptedProvider({ "uid-x": [tx("x1", -1000), tx("x2", -250)] });

    const res = await syncHousehold({
      db: asCronDb(db),
      householdId: h.id,
      plan: "Premium",
      provider,
      now: NOW,
      classifier: vi.fn(stubClassifier),
    });

    expect(res).toEqual({ inserted: 2, failed: 0 });
    const pending = (await h.repo.transactions.list()).filter((t) => t.classificationStatus === "pending");
    expect(pending).toHaveLength(0);
  });

  it("is idempotent — a second sync over an overlapping window inserts nothing new", async () => {
    const h = await premiumHousehold();
    await activeConnectionWithAccount(h.repo, "uid-y");
    const provider = scriptedProvider({ "uid-y": [tx("y1", -800)] });
    const base = {
      db: asCronDb(db),
      householdId: h.id,
      plan: "Premium" as const,
      provider,
      classifier: vi.fn(stubClassifier),
    };

    const first = await syncHousehold({ ...base, now: NOW });
    // A refresh (or the daily cron) re-fires the same connection a day later.
    const second = await syncHousehold({ ...base, now: new Date(NOW.getTime() + 86_400_000) });

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(await h.repo.transactions.list()).toHaveLength(1);
  });
});
