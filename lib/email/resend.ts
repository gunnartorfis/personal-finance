/**
 * Minimal Resend email sender (#102, ADR-0019). Talks to the Resend REST API directly via `fetch`
 * (no SDK dependency), behind a small {@link EmailSender} interface so callers can inject a fake in
 * tests and the cron can depend on the interface, not the transport.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails"

export interface SendEmailParams {
  /** e.g. `Auratal <no-reply@auratal.is>`. */
  from: string
  to: string
  subject: string
  html: string
  replyTo?: string
  /** Extra headers, e.g. `List-Unsubscribe` for one-click unsubscribe. */
  headers?: Record<string, string>
}

export type SendEmailResult = { ok: true; id: string } | { ok: false; error: string }

export interface EmailSender {
  send(params: SendEmailParams): Promise<SendEmailResult>
}

export function createResendSender(apiKey: string, fetchImpl: typeof fetch = fetch): EmailSender {
  return {
    async send(params) {
      const body: Record<string, unknown> = {
        from: params.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }
      if (params.replyTo) body.reply_to = params.replyTo
      if (params.headers) body.headers = params.headers

      try {
        const response = await fetchImpl(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        })

        const payload = (await response.json().catch(() => null)) as
          | { id?: string; message?: string; name?: string }
          | null

        if (!response.ok) {
          return { ok: false, error: payload?.message ?? `Resend responded ${response.status}` }
        }
        if (!payload?.id) {
          return { ok: false, error: "Resend response missing an email id" }
        }
        return { ok: true, id: payload.id }
      } catch (error) {
        // A transport failure is never fatal to the caller — the cron records no send-ledger row and
        // retries next run. Surface the reason instead of throwing.
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

