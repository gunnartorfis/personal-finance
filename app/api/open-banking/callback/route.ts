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
  // Snapshot which cookies arrived BEFORE deleting the state cookie, so a genuinely-missing cookie is
  // distinguishable from one that was present and just consumed.
  const arrivedCookies = jar.getAll().map((c) => c.name)
  jar.delete(STATE_COOKIE)

  // Diagnostic: confirms the callback handler ran (vs middleware/session bounce) and shows which
  // inputs arrived on the cross-site redirect. `code`/state values are truncated — not logged raw.
  const trunc = (v: string | null | undefined) => (v ? `${v.slice(0, 8)}…(${v.length})` : v ?? null)
  console.log("[ob:callback] hit", {
    hasCode: Boolean(code),
    error: error ?? null,
    stateParam: trunc(state),
    stateCookie: trunc(expectedState),
    stateMatches: Boolean(state && expectedState && state === expectedState),
    arrivedCookies,
  })

  const back = (status: "connected" | "error") =>
    NextResponse.redirect(new URL(`/accounts?bank=${status}`, request.url))

  // CSRF: the echoed state must match the cookie set at connect-start.
  if (error || !code || !state || !expectedState || state !== expectedState) {
    console.warn("[ob:callback] rejected before intent lookup", {
      reason: error
        ? "bank_error"
        : !code
          ? "missing_code"
          : !state
            ? "missing_state_param"
            : !expectedState
              ? "missing_state_cookie"
              : "state_mismatch",
    })
    return back("error")
  }

  try {
    // Recover the Household (and chosen institution) from the intent — single-use, keyed by the
    // unguessable state. No session needed, so a cross-site callback resolves correctly.
    const db = getDb()
    const intent = await consumeConnectIntent(db, state)
    if (!intent) {
      console.warn("[ob:callback] no matching intent (unknown/expired/replayed)", {
        stateParam: trunc(state),
      })
      return back("error")
    }
    console.log("[ob:callback] intent resolved", {
      householdId: intent.householdId,
      institutionName: intent.institutionName,
    })
    const repo = householdRepo(db, intent.householdId)
    const provider = getIngestionProvider()
    const result = await completeBankConnection({
      repo,
      provider,
      code,
      institutionName: intent.institutionName ?? undefined,
    })
    console.log("[ob:callback] connection completed", {
      connectionId: result.connectionId,
      accounts: result.accountIds.length,
    })
  } catch (err) {
    console.error("[ob:callback] failed during intent/provider/persist", err)
    return back("error")
  }
  console.log("[ob:callback] redirecting to accounts?bank=connected")
  return back("connected")
}
