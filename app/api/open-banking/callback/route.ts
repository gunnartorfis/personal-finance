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

  // Return a same-origin HTML interstitial that navigates client-side, rather than an HTTP redirect.
  // The bank's redirect into this callback is cross-site, and a 307 to /accounts is treated by the
  // browser as a continuation of that cross-site navigation — so a SameSite=Strict session cookie is
  // withheld and the auth-gated /accounts page bounces to sign-in even though the user is logged in.
  // A JS-initiated navigation from this same-origin page is same-site, so the session cookie rides
  // along. `status` is a fixed literal (no injection); the meta-refresh is a no-JS fallback.
  const back = (status: "connected" | "error") => {
    const target = new URL(`/accounts?bank=${status}`, request.url).toString()
    const targetJson = JSON.stringify(target)
    const html =
      `<!doctype html><html><head><meta charset="utf-8"><title>Finishing up…</title>` +
      `<meta name="robots" content="noindex">` +
      `<meta http-equiv="refresh" content="0;url=${target}">` +
      `<script>location.replace(${targetJson})</script></head>` +
      `<body><p>Finishing up… <a href="${target}">Continue</a>.</p></body></html>`
    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Never cache an OAuth callback response: a cached interstitial could re-redirect on
        // replay/back-navigation without re-running CSRF + intent consumption.
        "cache-control": "no-store",
      },
    })
  }

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
