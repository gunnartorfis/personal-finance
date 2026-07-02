import type { HouseholdRepo } from "@/lib/db/household-repo";

import type { IngestionProvider } from "./provider";

export interface ConnectResult {
  connectionId: string;
  accountIds: string[];
}

/**
 * Complete a bank connection from the aggregator's callback `code` (slice #113): authorize the
 * consent session, persist a Bank connection (session id + consent expiry), and discover/persist its
 * accounts as synced Accounts. Idempotent — the connection is keyed by (provider, session id) and
 * each account by (connection, aggregator uid), so a replayed callback reuses existing rows rather
 * than duplicating them. Free of HTTP/cookies; the route handler supplies repo + provider + code.
 */
export async function completeBankConnection(params: {
  repo: HouseholdRepo;
  provider: IngestionProvider;
  code: string;
}): Promise<ConnectResult> {
  const { repo, provider, code } = params;
  const session = await provider.authorizeSession(code);

  const existingConnection = await repo.bankConnections.byProviderConnectionId(
    provider.name,
    session.sessionId,
  );
  const connection =
    existingConnection ??
    (
      await repo.bankConnections.create({
        provider: provider.name,
        providerConnectionId: session.sessionId,
        consentExpiresAt: new Date(session.consentValidUntil),
        status: "active",
      })
    )[0];

  const accountIds: string[] = [];
  for (const account of session.accounts) {
    const existing = await repo.accounts.bySyncKey(connection.id, account.uid);
    if (existing) {
      accountIds.push(existing.id);
      continue;
    }
    const [created] = await repo.accounts.create({
      name: account.name ?? account.iban ?? "Bank account",
      connectionId: connection.id,
      externalAccountId: account.uid,
    });
    accountIds.push(created.id);
  }

  return { connectionId: connection.id, accountIds };
}
