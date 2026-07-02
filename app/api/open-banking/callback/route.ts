import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { getDb } from "@/lib/db"
import { householdRepo } from "@/lib/db/household-repo"
import { completeBankConnection } from "@/lib/open-banking/connect"
import { consumeConnectIntent, STATE_COOKIE } from "@/lib/open-banking/connect-intent"
import { getIngestionProvider } from "@/lib/open-banking/provider-factory"

/**
 * The aggregator redirects the user here after eID/SCA (slice #113). This arrives as a cross-site
 * top-level navigation from the bank, so the interactive auth session cookie is NOT guaranteed to be
 * sent — the callback therefore resolves the Household from the connect *intent* keyed by `state`
 * (recorded at connect-start) rather than from the session, which previously bounced the user to
 * sign-in. The Lax `state` cookie still provides CSRF. Always redirects back to the accounts page
 * with a `bank=connected|error` status.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  const jar = await cookies()
  const expectedState = jar.get(STATE_COOKIE)?.value
  jar.delete(STATE_COOKIE)

  const back = (status: "connected" | "error") =>
    NextResponse.redirect(new URL(`/accounts?bank=${status}`, request.url))

  // CSRF: the echoed state must match the cookie set at connect-start.
  if (error || !code || !state || !expectedState || state !== expectedState) {
    return back("error")
  }

  try {
    // Recover the Household (and chosen institution) from the intent — single-use, keyed by the
    // unguessable state. No session needed, so a cross-site callback resolves correctly.
    const db = getDb()
    const intent = await consumeConnectIntent(db, state)
    if (!intent) {
      return back("error")
    }
    const repo = householdRepo(db, intent.householdId)
    const provider = getIngestionProvider()
    await completeBankConnection({
      repo,
      provider,
      code,
      institutionName: intent.institutionName ?? undefined,
    })
  } catch (err) {
    console.error("open-banking callback failed", err)
    return back("error")
  }
  return back("connected")
}
