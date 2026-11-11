import { applicationUrl } from "@/lib/http/application-url"
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

  // Event-only diagnostics: never log OAuth state, cookies or provider payloads.
  console.log(JSON.stringify({ event: "banking.callback.received" }))

  // Return a same-origin HTML interstitial that navigates client-side, rather than an HTTP redirect.
  // The bank's redirect into this callback is cross-site, and a 307 to /accounts is treated by the
  // browser as a continuation of that cross-site navigation — so a SameSite=Strict session cookie is
  // withheld and the auth-gated /accounts page bounces to sign-in even though the user is logged in.
  // A JS-initiated navigation from this same-origin page is same-site, so the session cookie rides
  // along. `status` is a fixed literal (no injection); the meta-refresh is a no-JS fallback.
  const back = (status: "connected" | "error") => {
    const target = applicationUrl(`/accounts?bank=${status}`, request).toString()
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
    console.warn(JSON.stringify({ event: "banking.callback.rejected" }))
    return back("error")
  }

  try {
    // Recover the Household (and chosen institution) from the intent — single-use, keyed by the
    // unguessable state. No session needed, so a cross-site callback resolves correctly.
    const db = getDb()
    const intent = await consumeConnectIntent(db, state)
    if (!intent) {
      console.warn(JSON.stringify({ event: "banking.callback.intent_missing" }))
      return back("error")
    }
    console.log(JSON.stringify({ event: "banking.callback.intent_resolved" }))
    const repo = householdRepo(db, intent.householdId)
    const provider = getIngestionProvider()
    await completeBankConnection({
      repo,
      provider,
      code,
      institutionName: intent.institutionName ?? undefined,
    })
    console.log(JSON.stringify({ event: "banking.callback.completed" }))
  } catch {
    console.error(JSON.stringify({ event: "banking.callback.failed" }))
    return back("error")
  }
  console.log(JSON.stringify({ event: "banking.callback.redirecting" }))
  return back("connected")
}
