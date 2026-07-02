import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { completeBankConnection } from "./connect";
import { MockIngestionProvider } from "./mock-provider";

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

const provider = new MockIngestionProvider({
  session: {
    sessionId: "sess-1",
    consentValidUntil: "2026-06-01T00:00:00Z",
    accounts: [
      { uid: "uid-a", iban: "IS01", name: "Debit", currency: "ISK" },
      { uid: "uid-b", currency: "ISK" }, // no name/iban → fallback label
    ],
  },
});

describe("completeBankConnection", () => {
  it("persists the connection and discovers its accounts", async () => {
    const repo = await freshHousehold();
    const res = await completeBankConnection({
      repo,
      provider,
      code: "code",
      institutionName: "Landsbankinn",
    });

    const [conn] = await repo.bankConnections.list();
    expect(conn.provider).toBe("mock");
    expect(conn.providerConnectionId).toBe("sess-1");
    expect(conn.status).toBe("active");
    // Persisted so the reconnect flow (#116) has a name to hand back to the aggregator.
    expect(conn.institutionName).toBe("Landsbankinn");
    expect(conn.consentExpiresAt?.toISOString()).toBe("2026-06-01T00:00:00.000Z");

    const accounts = await repo.accounts.list();
    expect(accounts).toHaveLength(2);
    expect(accounts.find((a) => a.externalAccountId === "uid-a")?.name).toBe("Debit");
    expect(accounts.find((a) => a.externalAccountId === "uid-b")?.name).toBe("Bank account");
    expect(accounts.every((a) => a.connectionId === conn.id)).toBe(true);
    expect(res.accountIds).toHaveLength(2);
  });

  it("is idempotent when the same callback is replayed", async () => {
    const repo = await freshHousehold();
    const first = await completeBankConnection({ repo, provider, code: "code" });
    const second = await completeBankConnection({ repo, provider, code: "code" });

    expect(await repo.bankConnections.list()).toHaveLength(1);
    expect(await repo.accounts.list()).toHaveLength(2);
    expect(second.connectionId).toBe(first.connectionId);
    expect(second.accountIds).toEqual(first.accountIds);
  });

  it("reconnect refreshes the stale connection in place instead of leaving it behind", async () => {
    const repo = await freshHousehold();
    const first = await completeBankConnection({
      repo,
      provider,
      code: "code",
      institutionName: "Landsbankinn",
    });
    // The connection later goes stale (sync errored / consent expired), triggering a reconnect alert.
    await repo.bankConnections.update(first.connectionId, { status: "error" });

    // Re-consent issues a NEW session id for the same institution.
    const reconsented = new MockIngestionProvider({
      session: {
        sessionId: "sess-2",
        consentValidUntil: "2026-09-01T00:00:00Z",
        accounts: [
          { uid: "uid-a", iban: "IS01", name: "Debit", currency: "ISK" },
          { uid: "uid-b", currency: "ISK" },
        ],
      },
    });
    const again = await completeBankConnection({
      repo,
      provider: reconsented,
      code: "code-2",
      institutionName: "Landsbankinn",
    });

    // Same connection reused (no stale duplicate), re-pointed at the new session and back to active.
    expect(again.connectionId).toBe(first.connectionId);
    const connections = await repo.bankConnections.list();
    expect(connections).toHaveLength(1);
    expect(connections[0].status).toBe("active");
    expect(connections[0].providerConnectionId).toBe("sess-2");
    expect(connections[0].consentExpiresAt?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    // Accounts stay attached to the reused connection — no duplication.
    expect(await repo.accounts.list()).toHaveLength(2);
  });
});
