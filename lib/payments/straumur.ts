/**
 * Straumur payment primitives (ADR-0006).
 *
 * Straumur is the Icelandic gateway that wraps Adyen; we call its wrapper API and it translates to
 * Adyen. This module holds the framework-agnostic, network-free pieces shared by the checkout and
 * webhook layers: amount wire-format conversion, the webhook field-normalisation quirk, and HMAC
 * verification of inbound payment webhooks (the trust boundary). The HTTP client and routes build on
 * these in later slices.
 *
 * Env (Straumur Merchant Portal, per environment) consumed by the client/webhook layers:
 *   STRAUMUR_API_KEY              — `X-API-Key` on every call
 *   STRAUMUR_TERMINAL_IDENTIFIER  — 12-char terminal id, injected server-side
 *   STRAUMUR_API_BASE_URL         — wrapper API root (no trailing slash)
 *   STRAUMUR_WEBHOOK_HMAC_KEY     — hex HMAC key; the signature rides in the webhook JSON body
 */

/**
 * Convert a caller-facing amount to Straumur's wire format. Callers pass whole units of the billing
 * currency (this app is ISK-only per ADR-0004: 1990 ISK → 1990). Straumur's wire contract uses
 * 2-decimal minor units, with a "must end in 00" rule for ISK (errorCode 2026), so ISK is ×100;
 * other currencies are assumed already in minor units. Normalised in one place so an anti-tampering
 * check can apply the same transform to the expected price.
 */
export function toStraumurWireAmount(
  value: number,
  currency: string,
): { amount: number; currency: string } {
  const amount = currency === "ISK" ? value * 100 : value;
  return { amount, currency };
}

/**
 * Coalesce a Straumur webhook field to the empty string the HMAC calculator expects for "missing".
 * Straumur's serialiser emits the literal text `"null"` for missing optional fields, but signs them
 * as empty — without this, the wire `"null"` enters the signing string as four characters while
 * theirs is empty and the digests diverge. Exported so the webhook handler applies the same rule
 * before persisting (no literal `"null"` landing in stored columns).
 */
export function normalizeStraumurField(value: string | null | undefined): string {
  if (value == null || value === "null") return "";
  return value;
}

/**
 * Verify the HMAC signature on a Straumur payment webhook payload
 * (https://skjolun.straumur.is/webhooks/payment/hmac-validation).
 *
 * The signing string is the colon-join of the raw values of
 * [checkoutReference, payfacReference, merchantReference, amount, currency, reason, success]
 * (missing → empty via {@link normalizeStraumurField}; NO escaping, unlike Adyen's classic webhook).
 * HMAC-SHA256 with the hex-decoded key as raw bytes, base64-encode, and timing-safe compare against
 * `hmacSignature`. Returns false on any malformed input rather than throwing.
 */
export async function verifyStraumurHmac(
  payload: {
    checkoutReference?: string | null;
    payfacReference?: string | null;
    merchantReference?: string | null;
    amount?: string | null;
    currency?: string | null;
    reason?: string | null;
    success?: string | null;
    hmacSignature?: string | null;
  },
  hexKey: string,
): Promise<boolean> {
  // Coalesce the signature too, so a wire-format `"null"` rejects as "missing" rather than decoding
  // to stray bytes and logging a misleading mismatch.
  const receivedSignature = normalizeStraumurField(payload.hmacSignature);
  if (!receivedSignature) return false;

  const signingString = [
    normalizeStraumurField(payload.checkoutReference),
    normalizeStraumurField(payload.payfacReference),
    normalizeStraumurField(payload.merchantReference),
    normalizeStraumurField(payload.amount),
    normalizeStraumurField(payload.currency),
    normalizeStraumurField(payload.reason),
    normalizeStraumurField(payload.success),
  ].join(":");

  const keyBytes = hexToBytes(hexKey);
  if (!keyBytes) return false;

  const cryptoKey = await crypto.subtle.importKey(
    // crypto.subtle wants BufferSource; the Uint8Array is plain ArrayBuffer-backed (safe cast).
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode(signingString) as BufferSource,
    ),
  );

  let received: Uint8Array;
  try {
    received = Uint8Array.from(atob(receivedSignature), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }

  return timingSafeEqual(digest, received);
}

/** Decode a hex string to bytes, or null if it isn't valid even-length hex. */
function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim();
  if (clean.length === 0 || clean.length % 2 !== 0) return null;
  // Full-string check: parseInt stops at the first non-hex char (parseInt("1g",16) === 1), so the
  // per-byte NaN guard alone would silently accept a key like "1g..." and use wrong bytes.
  if (!/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

/** Constant-time byte comparison; false if lengths differ. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}
