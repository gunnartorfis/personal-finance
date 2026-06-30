import { getDb } from "@/lib/db"
import { normalizeStraumurField, verifyStraumurHmac } from "@/lib/payments/straumur"
import {
  extractRecurringDetailReference,
  parseHouseholdIdFromReference,
  recordWebhookEvent,
} from "@/lib/payments/straumur-webhook"

interface StraumurWebhookBody {
  checkoutReference?: string | null
  payfacReference?: string | null // Straumur renames Adyen's pspReference to this at the top level
  merchantReference?: string | null
  amount?: string | null
  currency?: string | null
  reason?: string | null
  success?: string | null
  hmacSignature?: string | null
  additionalData?: Record<string, unknown> | null
}

// Adyen's contract (which Straumur wraps): any response other than the literal "[accepted]" is a
// delivery failure and is retried with backoff for ~8 days. Return this for every non-error branch.
function accepted(): Response {
  return new Response("[accepted]", { status: 200, headers: { "Content-Type": "text/plain" } })
}

/**
 * POST /api/webhooks/straumur — Straumur payment webhook (ADR-0006). Verifies the HMAC, then records
 * `Authorization` events idempotently in `straumur_payments` (the durable source of pspReference /
 * amount / recurring token). Non-Authorization events are ACKed and dropped; a 4xx/5xx makes
 * Straumur retry. No session/auth — the HMAC is the trust boundary.
 */
export async function POST(request: Request): Promise<Response> {
  let rawBody: string
  let payload: StraumurWebhookBody
  try {
    rawBody = await request.text()
    payload = JSON.parse(rawBody) as StraumurWebhookBody
  } catch {
    return new Response("Bad Request", { status: 400 })
  }

  const hmacKey = process.env.STRAUMUR_WEBHOOK_HMAC_KEY
  if (!hmacKey) {
    console.error("[straumur-webhook] STRAUMUR_WEBHOOK_HMAC_KEY not configured")
    return new Response("Webhook not configured", { status: 503 })
  }
  if (!(await verifyStraumurHmac(payload, hmacKey))) {
    return new Response("Unauthorized", { status: 401 })
  }

  const additionalData = payload.additionalData ?? null
  const eventType = typeof additionalData?.eventType === "string" ? additionalData.eventType : undefined
  if (eventType !== "Authorization") {
    // Other events (Capture/Refund/Tokenization/…) share the pspReference and would overwrite the
    // Authorization row; ACK so Straumur stops retrying. Opt them in as their flows land.
    // additionalData isn't HMAC-signed, so a *missing* eventType on a verified payload is
    // suspicious (a genuine Authorization we'd silently drop) — warn so it stays observable.
    if (eventType === undefined) {
      console.warn(
        `[straumur-webhook] HMAC-verified payload with no eventType — dropped (psp=${payload.payfacReference ?? "<missing>"})`,
      )
    } else {
      console.info(`[straumur-webhook] ignoring non-Authorization event: ${eventType}`)
    }
    return accepted()
  }

  const pspReference = normalizeStraumurField(payload.payfacReference)
  const merchantReference = normalizeStraumurField(payload.merchantReference)
  const amountStr = normalizeStraumurField(payload.amount)
  const currency = normalizeStraumurField(payload.currency)
  const successStr = normalizeStraumurField(payload.success)
  // Required so the row is findable/usable; 400 makes Straumur retry rather than us accepting an
  // unrecoverable record.
  if (!pspReference || !merchantReference || !amountStr || !currency || !successStr) {
    return new Response("Bad Request", { status: 400 })
  }
  const amount = Number(amountStr) // Number, not parseInt — "199000.5" must reject, not truncate.
  if (!Number.isInteger(amount)) {
    return new Response("Bad Request", { status: 400 })
  }

  try {
    await recordWebhookEvent(getDb(), {
      pspReference,
      householdId: parseHouseholdIdFromReference(merchantReference),
      merchantReference,
      checkoutReference: normalizeStraumurField(payload.checkoutReference) || null,
      recurringDetailReference: extractRecurringDetailReference(additionalData),
      amount,
      currency,
      success: successStr === "true",
      eventCode: eventType,
      reason: normalizeStraumurField(payload.reason) || null,
      rawEvent: rawBody.slice(0, 8192),
    })
  } catch (error) {
    // Transient DB failure: don't ACK, so Straumur retries.
    console.error("[straumur-webhook] failed to record event", error)
    return new Response("Server Error", { status: 500 })
  }

  return accepted()
}
