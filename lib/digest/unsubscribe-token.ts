import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Auth-less unsubscribe token for the Digest (#102, ADR-0019). A Member clicks the link in an email
 * with no session, so the token itself must prove which Member it is for: `<memberId>.<HMAC>`, signed
 * with a server secret. Verification recomputes the HMAC and compares constant-time, so the link
 * can't be forged for another Member and can't be tampered with. (A Member id is a UUID with no dot,
 * so the last dot cleanly separates id from signature.)
 */
function sign(memberId: string, secret: string): string {
  return createHmac("sha256", secret).update(memberId).digest("base64url")
}

export function digestUnsubscribeToken(memberId: string, secret: string): string {
  return `${memberId}.${sign(memberId, secret)}`
}

/** The Member id if the token is authentic, else null (tampered, wrong secret, or malformed). */
export function verifyDigestUnsubscribeToken(token: string, secret: string): string | null {
  const dot = token.lastIndexOf(".")
  if (dot <= 0 || dot === token.length - 1) return null
  const memberId = token.slice(0, dot)
  const provided = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(sign(memberId, secret))
  if (provided.length !== expected.length) return null
  return timingSafeEqual(provided, expected) ? memberId : null
}
