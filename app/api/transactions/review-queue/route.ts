import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Cap on how many queue rows one fetch returns, so a large backlog never ships as a single unbounded
 * payload. Reviewing a row drops it from the queue (it gains an override), so closing and reopening
 * the overlay pulls the next batch — well above a normal review sitting, and the badge (a separate
 * count) still reflects the true total.
 */
const REVIEW_QUEUE_LIMIT = 500

/**
 * The household-wide rapid-review queue (Phase H): expenses still lacking a manual override, across
 * all statement cycles, in the row shape `<ReviewMode>` consumes. Lazily fetched when the user opens
 * Rapid review, so the transactions page payload stays light and the queue is always fresh.
 * Household-scoped through the repo, so it only ever returns this tenant's rows.
 */
export async function GET() {
  const { repo } = await requireHousehold()
  const rows = await repo.transactions.reviewQueue(REVIEW_QUEUE_LIMIT)
  return NextResponse.json({ rows })
}
