import { unstable_rethrow } from "next/navigation"
import { NextResponse } from "next/server"

import { isBillingPeriod, subscriptionPriceISK } from "@/lib/billing/pricing"
import { requireHousehold } from "@/lib/household/current"
import { createSession } from "@/lib/payments/straumur"

/**
 * POST /api/billing/checkout — start a Premium subscription checkout (ADR-0006). Creates a Straumur
 * (Adyen Components) session for the current Household with `recurringProcessingModel: Subscription`
 * so the card is tokenized for later renewal charges; `merchantShopperReference` is the householdId.
 * Body: `{ period: "monthly" | "annual" }`. Returns the session for the client Adyen Drop-in.
 *
 * The actual Premium activation happens when the Authorization webhook arrives (see the webhook
 * route), not here — this only opens the payment session.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const period = (body as { period?: unknown } | null)?.period
  if (!isBillingPeriod(period)) {
    return NextResponse.json({ error: "period must be 'monthly' or 'annual'" }, { status: 400 })
  }

  try {
    const { householdId, billingCurrency } = await requireHousehold()
    // Pricing is ISK-only (ADR-0004); the DB CHECK only validates the currency *format*, so guard
    // against a non-ISK value sending a wrongly-scaled amount (toStraumurWireAmount skips the ×100).
    if (billingCurrency !== "ISK") {
      console.error(`checkout: unsupported billing currency ${billingCurrency}`)
      return NextResponse.json({ error: "unsupported_currency" }, { status: 500 })
    }
    const session = await createSession({
      amount: subscriptionPriceISK(period),
      currency: billingCurrency,
      // Random suffix so rapid/concurrent requests from one household can't collide on a reference
      // (Straumur/Adyen require it to be unique).
      reference: `sub_${householdId}_${period}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      returnUrl: new URL("/dashboard", request.url).toString(),
      recurringProcessingModel: "Subscription",
      merchantShopperReference: householdId,
    })
    return NextResponse.json(session)
  } catch (error) {
    // Let requireHousehold's redirect() control-flow pass through; convert real failures to a 502
    // (the gateway call is the likely culprit) so the client can distinguish from a bad request.
    unstable_rethrow(error)
    console.error("POST /api/billing/checkout failed", error)
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 })
  }
}
