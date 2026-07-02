import { NextResponse } from "next/server"

import { getDb } from "@/lib/db"
import { requireHousehold } from "@/lib/household/current"
import { deleteHousehold } from "@/lib/household/membership"

// Auth- and tenant-scoped per-request mutation.
export const dynamic = "force-dynamic"

/**
 * Delete the current Household and cascade ALL of its data (ADR-0010). Any Member may trigger it
 * (all Members equal, ADR-0002); it is the sole/last Member's only exit. Irreversible — the client
 * MUST confirm the destructive intent before calling.
 */
export async function DELETE() {
  const { householdId } = await requireHousehold()
  await deleteHousehold(getDb(), householdId)
  return NextResponse.json({ ok: true })
}
