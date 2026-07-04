import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
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
  const ctx = await requireHousehold()
  try {
    await leaveHousehold(getDb(), ctx.householdId, ctx.memberId)
  } catch (error) {
    if (error instanceof LeaveError) {
      return NextResponse.json({ error: error.code }, { status: 409 })
    }
    throw error
  }
  // Record the departure into the (still-existing) Household's log AFTER the leave succeeds. The
  // member row is now gone, but memberId is a plain uuid (no FK) and actorName is a snapshot, so
  // the departed member's action stays attributed and readable (ADR-0017).
  await recordActivity(ctx, ActivityAction.MemberLeft)
  return NextResponse.json({ ok: true })
}
