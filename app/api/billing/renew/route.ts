import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { isBillingPeriod, subscriptionPriceISK } from "@/lib/billing/pricing"
import { dueForRenewal } from "@/lib/billing/renew"
import { nextRenewal } from "@/lib/billing/renewal"
import { getDb } from "@/lib/db"
import { households } from "@/lib/db/schema"
import { chargeStoredToken, isAuthorised, isPending } from "@/lib/payments/straumur"

export const dynamic = "force-dynamic"
// Charges up to N due households sequentially; give the batch headroom.
export const maxDuration = 300

/** Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; reject anything else. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`
}

/**
 * Charge every due Premium subscription (ADR-0006). Triggered by the daily Vercel cron (see
 * vercel.json). For each due household, charges the stored token with a deterministic per-cycle
 * reference + idempotency key (so a retried run can't double-charge), advances `planRenewsAt` on an
 * authorised charge, and leaves a pending charge for the webhook to resolve. Persistent failures are
 * counted and handled by dunning (a later slice). The HMAC-equivalent trust boundary here is the
 * cron secret.
 */
async function handle(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const db = getDb()
  const now = new Date()
  const due = await dueForRenewal(db, now)

  let charged = 0
  let pending = 0
  let failed = 0

  for (const household of due) {
    if (!isBillingPeriod(household.subscriptionPeriod) || household.billingCurrency !== "ISK") {
      failed += 1
      continue
    }
    const period = household.subscriptionPeriod
    // The cycle being renewed identifies the charge — stable across retries so the gateway dedupes.
    const cycleKey = household.planRenewsAt.toISOString().slice(0, 10)
    try {
      const result = await chargeStoredToken({
        amount: subscriptionPriceISK(period),
        currency: household.billingCurrency,
        reference: `sub_${household.id}_${period}_${cycleKey}`,
        tokenValue: household.token,
        recurringProcessingModel: "Subscription",
        returnUrl: new URL("/dashboard", request.url).toString(),
        idempotencyKey: `renew-${household.id}-${cycleKey}`,
      })
      if (isAuthorised(result)) {
        // Advance immediately so the next run doesn't re-charge before the webhook lands; the
        // webhook sets the same absolute date, so there's no drift.
        await db
          .update(households)
          .set({ planRenewsAt: nextRenewal(now, period) })
          .where(eq(households.id, household.id))
        charged += 1
      } else if (isPending(result)) {
        pending += 1
      } else {
        failed += 1
      }
    } catch (error) {
      console.error(`[renew] charge failed for household ${household.id}`, error)
      failed += 1
    }
  }

  return NextResponse.json({ total: due.length, charged, pending, failed })
}

export { handle as GET, handle as POST }
