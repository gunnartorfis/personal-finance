import { timingSafeEqual } from "node:crypto"

import { NextResponse } from "next/server"

import { getDb } from "@/lib/db"
import { loadDigestCycleData } from "@/lib/digest/load-cycle"
import { listDigestRecipients } from "@/lib/digest/recipients"
import { runMonthlyDigest } from "@/lib/digest/run-monthly"
import { digestSendExists, recordDigestSend } from "@/lib/digest/sent-ledger"
import { digestUnsubscribeToken } from "@/lib/digest/unsubscribe-token"

/** The Digest sender identity (ADR-0019). Verified sender domain: auratal.is. */
const DIGEST_FROM = "Auratal <no-reply@auratal.is>"

export const dynamic = "force-dynamic"
// Sends to every eligible household sequentially; give the batch headroom like the other crons.
export const maxDuration = 300

/** Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; reject anything else (constant-time). */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

/**
 * Monthly Digest cron (#102, ADR-0019). Triggered by the Vercel monthly cron (see vercel.json), it
 * emails every eligible Member a summary of the just-closed Statement cycle. Wires the real deps
 * (recipients, per-household cycle load, send-ledger dedup, Resend transport, signed unsubscribe
 * links) into the tested {@link runMonthlyDigest} orchestration. Read-only over household data
 * (writes only the send-ledger). Returns per-run counts. The cron secret is the trust boundary.
 */
async function handle(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.RESEND_API_KEY
  const unsubscribeSecret = process.env.DIGEST_UNSUBSCRIBE_SECRET
  if (!apiKey || !unsubscribeSecret) {
    // Not an error the cron can fix by retrying — the deployment is missing email config.
    return NextResponse.json({ error: "email_not_configured" }, { status: 503 })
  }

  // Lazily construct the sender so a missing SDK/network never breaks the auth/config path above.
  const { createResendSender } = await import("@/lib/email/resend")

  const db = getDb()
  const now = new Date()
  const origin = new URL(request.url).origin

  const summary = await runMonthlyDigest({
    now,
    from: DIGEST_FROM,
    dashboardUrl: `${origin}/dashboard`,
    send: createResendSender(apiKey),
    listRecipients: () => listDigestRecipients(db),
    loadCycle: (householdId) => loadDigestCycleData(db, householdId, now),
    hasSent: (memberId, cycleKey) => digestSendExists(db, memberId, cycleKey),
    recordSent: (householdId, memberId, cycleKey) => recordDigestSend(db, householdId, memberId, cycleKey),
    unsubscribeUrlFor: (memberId, locale) => {
      const token = digestUnsubscribeToken(memberId, unsubscribeSecret)
      return `${origin}/digest/unsubscribe?token=${encodeURIComponent(token)}&l=${locale}`
    },
  })

  return NextResponse.json(summary)
}

// Vercel Cron only issues GET — don't expose an out-of-schedule send trigger via POST.
export { handle as GET }
