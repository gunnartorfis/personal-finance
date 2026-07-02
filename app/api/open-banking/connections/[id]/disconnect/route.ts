import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Disconnect a bank connection (#118): revoke consent locally so the daily sync stops touching it
 * (only `active` connections sync) and the reconnect prompts ignore it, while its accounts and
 * historical transactions are retained. Resolved through the household-scoped repo first, so another
 * tenant's id is a 404 — never a silent write. POST (a state change), not DELETE (nothing is removed).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid connection id" }, { status: 400 })
  }

  const { repo } = await requireHousehold()
  const connection = await repo.bankConnections.findById(id)
  if (!connection) {
    return NextResponse.json({ error: "connection not found" }, { status: 404 })
  }

  const [updated] = await repo.bankConnections.update(id, { status: "revoked" })
  return NextResponse.json({ id: updated.id, status: updated.status })
}
