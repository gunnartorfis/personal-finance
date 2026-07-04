import { randomUUID } from "node:crypto"

import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { getDb } from "@/lib/db"
import { requireHousehold } from "@/lib/household/current"
import { recordConnectIntent, STATE_COOKIE } from "@/lib/open-banking/connect-intent"
import { getIngestionProvider } from "@/lib/open-banking/provider-factory"
import { canUseBankSync } from "@/shared/bank-sync"

const CONSENT_DAYS = 90

/** Cap on the institution name we persist against the connect intent; bounded so it can't bloat a row. */
const MAX_INSTITUTION_NAME_LENGTH = 200

/** Enable Banking takes an ISO-3166 alpha-2 country; the UI sends e.g. "IS". */
const COUNTRY_RE = /^[A-Z]{2}$/

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
  const country = typeof body?.country === "string" ? body.country.toUpperCase() : body?.country
  if (typeof institutionName !== "string" || typeof country !== "string") {
    return NextResponse.json({ error: "institutionName and country are required" }, { status: 400 })
  }
  // Bound the persisted name and require a well-formed 2-letter country before any provider/DB work.
  if (institutionName.length > MAX_INSTITUTION_NAME_LENGTH || !COUNTRY_RE.test(country)) {
    return NextResponse.json({ error: "invalid institutionName or country" }, { status: 400 })
  }

  // Bank auto-sync is Premium-only (#117); a Free household is told to upgrade before any provider
  // call. This is the real enforcement — the UI hides the entry, but the API is the trust boundary.
  const { plan, householdId } = await requireHousehold()
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

  // Persist the household + institution against this state so the cross-site callback can resolve
  // them without the interactive session cookie (which isn't sent on the bank's redirect back).
  await recordConnectIntent(getDb(), { state, householdId, institutionName })

  // The state cookie is the CSRF guard: the callback matches it against the echoed `state`.
  ;(await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  })

  // Diagnostic: correlate with `[ob:callback]` by the truncated state. Confirms intent was written
  // and shows the redirect_url + the bank auth host we're sending the user to.
  console.log("[ob:connect] intent recorded + auth started", {
    householdId,
    institution: institutionName,
    state: `${state.slice(0, 8)}…`,
    redirectUrl,
    authHost: (() => {
      try {
        return new URL(url).host
      } catch {
        return "unparseable"
      }
    })(),
  })
  return NextResponse.json({ url })
}
