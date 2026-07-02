import { randomUUID } from "node:crypto"

import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"
import { getIngestionProvider } from "@/lib/open-banking/provider-factory"
import { canUseBankSync } from "@/shared/bank-sync"

/** Correlates the start request with its callback (CSRF guard); short-lived, httpOnly. */
export const STATE_COOKIE = "ob_connect_state"
const CONSENT_DAYS = 90

/**
 * Begin a bank connection (slice #113): start the aggregator's consent authorization and return the
 * bank redirect URL for the client to send the user to (eID / SCA). A random `state` is stored in an
 * httpOnly cookie and echoed back on the callback to prevent CSRF. Household-scoped; Premium gating
 * is added in #117. The live eID redirect is verified manually with sandbox credentials.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    institutionName?: unknown
    country?: unknown
  } | null
  const institutionName = body?.institutionName
  const country = body?.country
  if (typeof institutionName !== "string" || typeof country !== "string") {
    return NextResponse.json({ error: "institutionName and country are required" }, { status: 400 })
  }

  // Bank auto-sync is Premium-only (#117); a Free household is told to upgrade before any provider
  // call. This is the real enforcement — the UI hides the entry, but the API is the trust boundary.
  const { plan } = await requireHousehold()
  if (!canUseBankSync(plan)) {
    return NextResponse.json({ error: "upgrade_required" }, { status: 403 })
  }

  const provider = getIngestionProvider()
  const state = randomUUID()
  const redirectUrl = new URL("/api/open-banking/callback", request.url).toString()
  const validUntil = new Date(Date.now() + CONSENT_DAYS * 86_400_000).toISOString()

  const { url } = await provider.startAuth({
    institution: { name: institutionName, country },
    state,
    redirectUrl,
    validUntil,
  })

  ;(await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  })
  return NextResponse.json({ url })
}
