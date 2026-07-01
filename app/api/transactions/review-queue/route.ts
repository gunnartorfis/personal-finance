import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * The household-wide rapid-review queue (Phase H): every expense still lacking a manual override,
 * across all statement cycles, in the row shape `<ReviewMode>` consumes. Lazily fetched when the user
 * opens Rapid review, so the transactions page payload stays light and the queue is always fresh.
 * Household-scoped through the repo, so it only ever returns this tenant's rows.
 */
export async function GET() {
  const { repo } = await requireHousehold()
  const rows = await repo.transactions.reviewQueue()
  return NextResponse.json({ rows })
}
