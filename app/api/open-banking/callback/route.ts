import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"
import { completeBankConnection } from "@/lib/open-banking/connect"
import { getIngestionProvider } from "@/lib/open-banking/provider-factory"

import { STATE_COOKIE } from "../connect/route"

/**
 * The aggregator redirects the user here after eID/SCA (slice #113). Verify the `state` against the
 * cookie (CSRF), exchange the `code` for a session, and persist the connection + its accounts. Always
 * redirects back to the accounts page with a `bank=connected|error` status. Household-scoped. The live
 * redirect/eID leg is verified manually with sandbox credentials.
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

  if (error || !code || !state || !expectedState || state !== expectedState) {
    return back("error")
  }

  // requireHousehold stays outside the try: on an expired session it redirects to sign-in (a
  // NEXT_REDIRECT the framework must handle), which a catch would swallow. Everything that can throw
  // a genuine error — a missing/misconfigured provider, the code exchange, persistence — is caught
  // and turned into a graceful bank=error redirect.
  const { repo } = await requireHousehold()
  try {
    const provider = getIngestionProvider()
    await completeBankConnection({ repo, provider, code })
  } catch (err) {
    console.error("open-banking callback failed", err)
    return back("error")
  }
  return back("connected")
}
