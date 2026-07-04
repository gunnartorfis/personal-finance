import { unstable_rethrow } from "next/navigation"
import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { downgradeToFree } from "@/lib/billing/dunning"
import { getDb } from "@/lib/db"
import { requireHousehold } from "@/lib/household/current"

/**
 * POST /api/billing/cancel — cancel the current Household's Premium subscription (ADR-0006).
 * Downgrades to Free immediately, clearing the renewal date, period and stored token (so the cron
 * stops charging). Idempotent: cancelling a Free household is a no-op. The card token isn't disabled
 * at the gateway here — local clearing is enough to stop charges; gateway-side disable is a future
 * enhancement.
 */
export async function POST() {
  try {
    const ctx = await requireHousehold()
    if (ctx.plan !== "Premium") {
      return NextResponse.json({ cancelled: false })
    }
    await downgradeToFree(getDb(), ctx.householdId)
    // Best-effort audit log — the downgrade is already committed, so a log failure must not turn
    // a successful cancel into a 500 (which the outer catch would do).
    try {
      await recordActivity(ctx, ActivityAction.BillingCancelled)
    } catch (logError) {
      console.error("failed to record billing.cancelled activity", logError)
    }
    return NextResponse.json({ cancelled: true })
  } catch (error) {
    unstable_rethrow(error)
    console.error("POST /api/billing/cancel failed", error)
    return NextResponse.json({ error: "cancel_failed" }, { status: 500 })
  }
}
