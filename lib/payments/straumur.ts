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

// =============================================================================
// HTTP client (sessioncheckout) — Adyen Components session via Straumur's wrapper
// =============================================================================

/** Adyen `recurringProcessingModel`; subscriptions use `Subscription` (merchant-initiated, fixed). */
export type RecurringProcessingModel = "Subscription" | "CardOnFile" | "UnscheduledCardOnFile";

export interface CreateSessionRequest {
  /** Whole units of the billing currency (ISK krónur); normalised to wire format internally. */
  amount: number;
  currency: string;
  /** Unique order reference; echoed back as `merchantReference` in webhooks. */
  reference: string;
  /** Where Adyen redirects after 3-D Secure; its origin is also sent as `origin`. */
  returnUrl: string;
  /** Set to tokenize the card for future charges (subscriptions: `Subscription`). */
  recurringProcessingModel?: RecurringProcessingModel;
  /** Ties the stored token to our customer (we use the householdId). */
  merchantShopperReference?: string;
}

export interface CreateSessionResponse {
  id: string;
  sessionData: string;
  clientKey: string;
  checkoutReference: string;
}

export type SessionStatus =
  | "Active"
  | "Completed"
  | "Canceled"
  | "Expired"
  | "PaymentPending"
  | "Refused";

export interface SessionStatusResponse {
  status: SessionStatus;
  responseDateTime?: string;
  responseIdentifier?: string;
}

interface StraumurConfig {
  apiKey: string;
  terminalIdentifier: string;
  apiBaseUrl: string;
}

/** Read Straumur config from the environment. Throws only when called (keeps `next build` green). */
function getConfig(): StraumurConfig {
  const apiKey = process.env.STRAUMUR_API_KEY;
  const terminalIdentifier = process.env.STRAUMUR_TERMINAL_IDENTIFIER;
  const apiBaseUrl = process.env.STRAUMUR_API_BASE_URL;
  if (!apiKey) throw new Error("STRAUMUR_API_KEY not configured");
  if (!terminalIdentifier) throw new Error("STRAUMUR_TERMINAL_IDENTIFIER not configured");
  if (!apiBaseUrl) throw new Error("STRAUMUR_API_BASE_URL not configured");
  return { apiKey, terminalIdentifier, apiBaseUrl: apiBaseUrl.replace(/\/+$/, "") };
}

function originFromUrl(returnUrl: string): string {
  const url = new URL(returnUrl); // throws on an invalid URL — surfaced to the caller
  return `${url.protocol}//${url.host}`;
}

/**
 * Create an Adyen Components checkout session via Straumur's wrapper. The terminal id and amount
 * normalisation are injected server-side. Passing `recurringProcessingModel` tokenizes the card for
 * later merchant-initiated charges. Straumur rejects unknown fields (errorCode 1006), so only the
 * documented fields are sent.
 */
export async function createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
  const config = getConfig();
  const wire = toStraumurWireAmount(request.amount, request.currency);

  const body: Record<string, unknown> = {
    terminalIdentifier: config.terminalIdentifier,
    amount: wire.amount,
    currency: wire.currency,
    reference: request.reference,
    channel: "Web",
    origin: originFromUrl(request.returnUrl),
    threeDsReturnUrl: request.returnUrl,
  };
  if (request.recurringProcessingModel) {
    body.recurringProcessingModel = request.recurringProcessingModel;
  }
  if (request.merchantShopperReference) {
    body.merchantShopperReference = request.merchantShopperReference;
  }

  const response = await fetch(`${config.apiBaseUrl}/api/v1/sessioncheckout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Failed to create Straumur session: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as {
    checkoutReference: string;
    clientKey: string;
    session: { id: string; sessionData: string };
  };
  return {
    id: json.session.id,
    sessionData: json.session.sessionData,
    clientKey: json.clientKey,
    checkoutReference: json.checkoutReference,
  };
}

export interface ChargeStoredTokenRequest {
  /** Whole units of the billing currency (ISK krónur); normalised to wire format internally. */
  amount: number;
  currency: string;
  reference: string;
  /** The stored card token (Adyen recurringDetailReference) captured at signup. */
  tokenValue: string;
  recurringProcessingModel: RecurringProcessingModel;
  /** Required by the API though no shopper is redirected for a merchant-initiated charge. */
  returnUrl: string;
  /**
   * Optional idempotency key, sent as the `Idempotency-Key` header. Adyen-based gateways don't
   * dedupe on `reference`, so a retried charge after a network timeout could double-charge — pass a
   * stable key per renewal cycle so the gateway collapses retries.
   */
  idempotencyKey?: string;
}

export interface ChargeResult {
  resultCode: string; // "Authorised" | "Refused" | "Error" | "Cancelled" | "RedirectShopper"
  payfacReference?: string; // pspReference of the charge
  checkoutReference?: string;
  reference?: string;
}

/** Whether a {@link ChargeResult} is a successful authorisation. */
export function isAuthorised(result: ChargeResult): boolean {
  return result.resultCode === "Authorised";
}

/**
 * Whether a charge is still being processed asynchronously (neither a success nor a definitive
 * failure). The renewal caller should NOT start dunning on these — the eventual outcome arrives via
 * the Authorization webhook.
 */
export function isPending(result: ChargeResult): boolean {
  return result.resultCode === "Pending" || result.resultCode === "Received";
}

/**
 * Merchant-initiated charge against a stored token (ADR-0006) — the renewal charge. Calls Straumur's
 * "Pay with Token" endpoint (`POST /api/v1/payment`) with `tokenDetails`. No shopper is present, so
 * 3-D Secure can't run; a `RedirectShopper` result is therefore a failure for an unattended renewal
 * and the caller should treat it as such (dunning).
 */
export async function chargeStoredToken(request: ChargeStoredTokenRequest): Promise<ChargeResult> {
  const config = getConfig();
  const wire = toStraumurWireAmount(request.amount, request.currency);

  const body = {
    terminalIdentifier: config.terminalIdentifier,
    amount: wire.amount,
    currency: wire.currency,
    reference: request.reference,
    channel: "Web",
    origin: originFromUrl(request.returnUrl),
    returnUrl: request.returnUrl,
    tokenDetails: {
      tokenValue: request.tokenValue,
      recurringProcessingModel: request.recurringProcessingModel,
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": config.apiKey,
  };
  if (request.idempotencyKey) {
    headers["Idempotency-Key"] = request.idempotencyKey;
  }

  const response = await fetch(`${config.apiBaseUrl}/api/v1/payment`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Failed to charge Straumur token: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as {
    resultCode: string;
    payfacReference?: string;
    checkoutReference?: string;
    reference?: string;
  };
  return {
    resultCode: json.resultCode,
    payfacReference: json.payfacReference,
    checkoutReference: json.checkoutReference,
    reference: json.reference,
  };
}

/** Poll a session's coarse status. Payment details (pspReference/amount) arrive via the webhook. */
export async function getSessionStatus(
  sessionId: string,
  sessionResult?: string,
): Promise<SessionStatusResponse> {
  const config = getConfig();
  const url = new URL(
    `${config.apiBaseUrl}/api/v1/sessioncheckout/status/${encodeURIComponent(sessionId)}`,
  );
  if (sessionResult) url.searchParams.set("sessionResult", sessionResult);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "X-API-Key": config.apiKey },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to get Straumur session status: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as SessionStatusResponse;
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
