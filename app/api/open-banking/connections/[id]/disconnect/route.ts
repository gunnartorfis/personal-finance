import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"
import { getIngestionProvider } from "@/lib/open-banking/provider-factory"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Disconnect a bank connection (#118): revoke consent locally so the daily sync stops touching it
 * (only `active` connections sync) and the reconnect prompts ignore it, while its accounts and
 * historical transactions are retained, and also withdraw consent at the aggregator (best-effort).
 * Resolved through the household-scoped repo first, so another tenant's id is a 404 — never a silent
 * write. POST (a state change), not DELETE (nothing is removed).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid connection id" }, { status: 400 })
  }

  const ctx = await requireHousehold()
  const { repo } = ctx
  const connection = await repo.bankConnections.findById(id)
  if (!connection) {
    return NextResponse.json({ error: "connection not found" }, { status: 404 })
  }

  const [updated] = await repo.bankConnections.update(id, { status: "revoked" })
  if (!updated) {
    // The findById above makes this near-impossible, but guard a TOCTOU rather than crash on undefined.
    return NextResponse.json({ error: "connection not found" }, { status: 404 })
  }

  // Log only a real state change (a re-disconnect of an already-revoked connection is a no-op).
  // Best-effort: the local revoke is already committed, so a log failure must not fail the request.
  if (connection.status !== "revoked") {
    try {
      await recordActivity(ctx, ActivityAction.BankDisconnected, {
        connectionId: id,
        institutionName: connection.institutionName,
      })
    } catch (logError) {
      console.error("failed to record bank.disconnected activity", logError)
    }
  }

  // Best-effort: withdraw consent at the aggregator too (PSD2). A failure here — or a missing/
  // unconfigured provider — must not fail the disconnect: the connection is already revoked locally
  // and sync has stopped, so the worst case is a consent that lingers server-side until it expires.
  try {
    await getIngestionProvider().deleteSession(connection.providerConnectionId)
  } catch (err) {
    console.error(`[ob:disconnect] aggregator consent revoke failed for connection ${id}`, err)
  }

  return NextResponse.json({ id: updated.id, status: updated.status })
}
