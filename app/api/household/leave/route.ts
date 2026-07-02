import { NextResponse } from "next/server"

import { getDb } from "@/lib/db"
import { requireHousehold } from "@/lib/household/current"
import { leaveHousehold, LeaveError } from "@/lib/household/membership"

// Auth- and tenant-scoped per-request mutation.
export const dynamic = "force-dynamic"

/**
 * Leave the current Household (ADR-0010). Only valid when other Members remain; the sole Member gets
 * a 409 (`last_member`) and must delete the Household instead. On success the caller no longer
 * belongs to any Household — the client should route them to sign-in / a fresh start.
 */
export async function POST() {
  const { householdId, memberId } = await requireHousehold()
  try {
    await leaveHousehold(getDb(), householdId, memberId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof LeaveError) {
      return NextResponse.json({ error: error.code }, { status: 409 })
    }
    throw error
  }
}
