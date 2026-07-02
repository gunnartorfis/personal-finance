import type { bankConnections } from "@/lib/db/schema";

type BankConnectionStatus = (typeof bankConnections.$inferSelect)["status"];

/** Why a connection needs re-consent — drives the prompt copy. */
export type ReconnectReason = "error" | "expired" | "expiring";

/** The connection fields the reconnect selector reads (a subset of the row, for decoupling). */
export interface ConnectionStatusInput {
  id: string;
  institutionName: string | null;
  status: BankConnectionStatus;
  consentExpiresAt: Date | null;
}

/** A bank whose connection needs the user to re-run consent, ready to render. */
export interface ReconnectPrompt {
  id: string;
  institutionName: string;
  reason: ReconnectReason;
}

/** How many days before consent expiry we start nudging the user to reconnect. */
const EXPIRING_GRACE_DAYS = 7;

/**
 * Whether a connection needs reconnecting, and why (#116). A revoked connection is intentionally
 * disconnected and never prompts. A failed sync (`error`) always prompts. Otherwise expiry is
 * derived from `consentExpiresAt` (PSD2 re-consent ~every 90 days) — past due is `expired`, within
 * the grace window is `expiring` — falling back to a stored `expired`/`expiring` status when no date
 * is available. Returns null when nothing is needed.
 */
export function reconnectReason(
  connection: ConnectionStatusInput,
  now: Date,
): ReconnectReason | null {
  if (connection.status === "revoked") return null;
  if (connection.status === "error") return "error";

  if (connection.consentExpiresAt) {
    const msLeft = connection.consentExpiresAt.getTime() - now.getTime();
    if (msLeft <= 0) return "expired";
    if (msLeft <= EXPIRING_GRACE_DAYS * 86_400_000) return "expiring";
  }

  if (connection.status === "expired") return "expired";
  if (connection.status === "expiring") return "expiring";
  return null;
}

/**
 * The subset of connections needing reconnect, mapped to render-ready prompts (#116). A connection
 * with no stored `institutionName` is skipped: reconnect re-runs consent by handing that name to the
 * aggregator, so without it there's nothing to hand off and a prompt would only dead-end the user.
 */
export function reconnectPrompts(
  connections: ReadonlyArray<ConnectionStatusInput>,
  now: Date,
): ReconnectPrompt[] {
  return connections.flatMap((connection) => {
    const reason = reconnectReason(connection, now);
    if (!reason || !connection.institutionName) return [];
    return [{ id: connection.id, institutionName: connection.institutionName, reason }];
  });
}
