import { createTranslator } from "next-intl"

import { getDb } from "@/lib/db"
import { setDigestSubscription } from "@/lib/digest/subscription"
import { verifyDigestUnsubscribeToken } from "@/lib/digest/unsubscribe-token"
import { bcp47, defaultLocale, toLocale, type Locale } from "@/lib/i18n/config"
import en from "@/messages/en.json"
import is from "@/messages/is.json"

/**
 * Auth-less one-click unsubscribe from the Digest (#102, ADR-0019). The link in each email carries a
 * signed `token` (proves which Member) and `l` (their Locale). A valid token opts the Member out
 * (stamps `digest_unsubscribed_at`); an invalid/forged one changes nothing and just shows an error.
 * Renders a tiny localized confirmation page — there is no session here.
 */
export const dynamic = "force-dynamic"

const catalogs: Record<Locale, typeof en> = { en, is }

function htmlPage(locale: Locale, heading: string, body: string, status: number): Response {
  const doc = `<!DOCTYPE html><html lang="${bcp47[locale]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;color:#1c1917"><h1 style="font-size:1.25rem">${heading}</h1><p style="color:#57534e">${body}</p></body></html>`
  return new Response(doc, { status, headers: { "content-type": "text/html; charset=utf-8" } })
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const locale = toLocale(url.searchParams.get("l")) ?? defaultLocale
  const t = createTranslator({ locale, messages: catalogs[locale] })

  const secret = process.env.DIGEST_UNSUBSCRIBE_SECRET
  const token = url.searchParams.get("token") ?? ""
  const memberId = secret ? verifyDigestUnsubscribeToken(token, secret) : null

  if (!memberId) {
    return htmlPage(locale, t("digest.unsubscribed.invalid"), "", 400)
  }

  await setDigestSubscription(getDb(), memberId, false)
  return htmlPage(locale, t("digest.unsubscribed.title"), t("digest.unsubscribed.body"), 200)
}

export { handle as GET }
