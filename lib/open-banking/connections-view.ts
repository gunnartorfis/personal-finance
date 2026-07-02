import type { bankConnections } from "@/lib/db/schema";

type BankConnectionStatus = (typeof bankConnections.$inferSelect)["status"];

/** One synced account under a connection, for the accounts-page listing (#118). */
export interface ConnectionAccountView {
  id: string;
  name: string;
}

/** A bank connection with its accounts, shaped for the accounts-page management list (#118). */
export interface ConnectionView {
  id: string;
  institutionName: string;
  status: BankConnectionStatus;
  /** True once disconnected (consent revoked): sync stops, history is retained, no actions offered. */
  isDisconnected: boolean;
  accounts: ConnectionAccountView[];
}

/** The connection fields the view builder reads (a subset of the row). */
interface ConnectionInput {
  id: string;
  institutionName: string | null;
  status: BankConnectionStatus;
}

/** The account fields the view builder reads. */
interface AccountInput {
  id: string;
  name: string;
  connectionId: string | null;
}

/**
 * Group each bank connection with its synced accounts for the accounts-page management list (#118).
 * Manual accounts (no `connectionId`) are ignored here — they're handled by the accounts manager.
 * Pure; the reads live in the page.
 */
export function buildConnectionViews(
  connections: ReadonlyArray<ConnectionInput>,
  accounts: ReadonlyArray<AccountInput>,
): ConnectionView[] {
  return connections.map((connection) => ({
    id: connection.id,
    institutionName: connection.institutionName ?? "Bank connection",
    status: connection.status,
    isDisconnected: connection.status === "revoked",
    accounts: accounts
      .filter((account) => account.connectionId === connection.id)
      .map((account) => ({ id: account.id, name: account.name })),
  }));
}
