import { unstable_rethrow } from "next/navigation"
import { NextResponse } from "next/server"

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
    const { householdId, plan } = await requireHousehold()
    if (plan !== "Premium") {
      return NextResponse.json({ cancelled: false })
    }
    await downgradeToFree(getDb(), householdId)
    return NextResponse.json({ cancelled: true })
  } catch (error) {
    unstable_rethrow(error)
    console.error("POST /api/billing/cancel failed", error)
    return NextResponse.json({ error: "cancel_failed" }, { status: 500 })
  }
}
