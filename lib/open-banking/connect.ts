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
  /**
   * The institution the user chose at connect-start (carried through the callback). Persisted so the
   * reconnect flow (#116) has a name to hand back to the aggregator; without it a connection can't be
   * reconnected.
   */
  institutionName?: string;
}): Promise<ConnectResult> {
  const { repo, provider, code, institutionName } = params;
  const session = await provider.authorizeSession(code);
  const consentExpiresAt = new Date(session.consentValidUntil);

  // Reuse an existing connection so a reconnect refreshes it in place — keeping its accounts and
  // transaction history and clearing the error/expired status that triggered the alert — rather than
  // leaving a stale row behind (#116). Match the same session id first (idempotent replay / consent
  // extension), then fall back to a prior non-revoked connection for the same institution (re-consent
  // issues a new session id).
  const existingConnection =
    (await repo.bankConnections.byProviderConnectionId(provider.name, session.sessionId)) ??
    (institutionName
      ? await repo.bankConnections.byInstitution(provider.name, institutionName)
      : undefined);

  const connection = existingConnection
    ? (
        await repo.bankConnections.update(existingConnection.id, {
          providerConnectionId: session.sessionId,
          institutionName: institutionName ?? existingConnection.institutionName,
          consentExpiresAt,
          status: "active",
        })
      )[0]
    : (
        await repo.bankConnections.create({
          provider: provider.name,
          providerConnectionId: session.sessionId,
          institutionName: institutionName ?? null,
          consentExpiresAt,
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
