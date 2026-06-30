import { afterEach, describe, expect, it, vi } from "vitest";

import {
  chargeStoredToken,
  createSession,
  getSessionStatus,
  isAuthorised,
  normalizeStraumurField,
  toStraumurWireAmount,
  verifyStraumurHmac,
} from "./straumur";

function stubStraumurEnv() {
  vi.stubEnv("STRAUMUR_API_KEY", "test-api-key");
  vi.stubEnv("STRAUMUR_TERMINAL_IDENTIFIER", "TERMINAL1234");
  vi.stubEnv("STRAUMUR_API_BASE_URL", "https://checkout-api.staging.straumur.is/");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createSession", () => {
  it("posts the documented body (with tokenization fields) and parses the session", async () => {
    stubStraumurEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        checkoutReference: "chk_1",
        clientKey: "test_abc",
        session: { id: "CSBB_1", sessionData: "blob" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSession({
      amount: 1990,
      currency: "ISK",
      reference: "sub_h1_monthly_123",
      returnUrl: "https://app.example.com/dashboard",
      recurringProcessingModel: "Subscription",
      merchantShopperReference: "h1",
    });

    expect(result).toEqual({
      id: "CSBB_1",
      sessionData: "blob",
      clientKey: "test_abc",
      checkoutReference: "chk_1",
    });

    const [url, init] = fetchMock.mock.calls[0];
    // No trailing-slash duplication despite the env's trailing slash.
    expect(url).toBe("https://checkout-api.staging.straumur.is/api/v1/sessioncheckout");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit & { headers: Record<string, string> }).headers["X-API-Key"]).toBe(
      "test-api-key",
    );
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      terminalIdentifier: "TERMINAL1234",
      amount: 199000, // 1990 ISK -> minor units
      currency: "ISK",
      reference: "sub_h1_monthly_123",
      channel: "Web",
      origin: "https://app.example.com",
      threeDsReturnUrl: "https://app.example.com/dashboard",
      recurringProcessingModel: "Subscription",
      merchantShopperReference: "h1",
    });
  });

  it("throws when the gateway returns a non-ok response", async () => {
    stubStraumurEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => "errorCode 1006" }),
    );
    await expect(
      createSession({
        amount: 1990,
        currency: "ISK",
        reference: "r",
        returnUrl: "https://app.example.com/dashboard",
      }),
    ).rejects.toThrow(/422/);
  });

  it("throws a clear error when the API key is not configured", async () => {
    vi.stubEnv("STRAUMUR_TERMINAL_IDENTIFIER", "TERMINAL1234");
    vi.stubEnv("STRAUMUR_API_BASE_URL", "https://x");
    // STRAUMUR_API_KEY intentionally unset
    await expect(
      createSession({ amount: 1990, currency: "ISK", reference: "r", returnUrl: "https://a.b/c" }),
    ).rejects.toThrow(/STRAUMUR_API_KEY/);
  });
});

describe("chargeStoredToken", () => {
  it("posts the token-payment body and parses the result", async () => {
    stubStraumurEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resultCode: "Authorised",
        payfacReference: "PSP1",
        checkoutReference: "chk",
        reference: "sub_x",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await chargeStoredToken({
      amount: 1990,
      currency: "ISK",
      reference: "sub_x",
      tokenValue: "TOK",
      recurringProcessingModel: "Subscription",
      returnUrl: "https://app.example.com/dashboard",
    });
    expect(result).toEqual({
      resultCode: "Authorised",
      payfacReference: "PSP1",
      checkoutReference: "chk",
      reference: "sub_x",
    });
    expect(isAuthorised(result)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://checkout-api.staging.straumur.is/api/v1/payment");
    expect((init as RequestInit & { headers: Record<string, string> }).headers["X-API-Key"]).toBe(
      "test-api-key",
    );
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      terminalIdentifier: "TERMINAL1234",
      amount: 199000,
      currency: "ISK",
      reference: "sub_x",
      channel: "Web",
      origin: "https://app.example.com",
      returnUrl: "https://app.example.com/dashboard",
      tokenDetails: { tokenValue: "TOK", recurringProcessingModel: "Subscription" },
    });
  });

  it("isAuthorised is false for a non-authorised result", () => {
    expect(isAuthorised({ resultCode: "Refused" })).toBe(false);
    expect(isAuthorised({ resultCode: "RedirectShopper" })).toBe(false);
  });

  it("throws on a non-ok response", async () => {
    stubStraumurEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "err" }));
    await expect(
      chargeStoredToken({
        amount: 1990,
        currency: "ISK",
        reference: "r",
        tokenValue: "T",
        recurringProcessingModel: "Subscription",
        returnUrl: "https://a.b/c",
      }),
    ).rejects.toThrow(/500/);
  });
});

describe("getSessionStatus", () => {
  it("GETs the status endpoint with the api key and returns the status", async () => {
    stubStraumurEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "Completed" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSessionStatus("CSBB 1", "res-token");
    expect(result.status).toBe("Completed");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://checkout-api.staging.straumur.is/api/v1/sessioncheckout/status/CSBB%201?sessionResult=res-token",
    );
    expect((init as RequestInit & { headers: Record<string, string> }).headers["X-API-Key"]).toBe(
      "test-api-key",
    );
  });
});

describe("toStraumurWireAmount", () => {
  it("multiplies ISK whole krónur to minor units (ends in 00)", () => {
    expect(toStraumurWireAmount(1990, "ISK")).toEqual({ amount: 199000, currency: "ISK" });
  });

  it("leaves non-ISK currencies untouched (already minor units)", () => {
    expect(toStraumurWireAmount(4900, "USD")).toEqual({ amount: 4900, currency: "USD" });
  });
});

describe("normalizeStraumurField", () => {
  it("coalesces null, undefined, and the literal string \"null\" to empty", () => {
    expect(normalizeStraumurField(null)).toBe("");
    expect(normalizeStraumurField(undefined)).toBe("");
    expect(normalizeStraumurField("null")).toBe("");
  });

  it("passes real values through unchanged", () => {
    expect(normalizeStraumurField("TTM8R7M75KM528Q9")).toBe("TTM8R7M75KM528Q9");
    expect(normalizeStraumurField("0")).toBe("0");
  });
});

// HMAC reference calculator, mirroring Straumur's spec (used to forge valid signatures in tests).
async function sign(
  fields: [string, string, string, string, string, string, string],
  hexKey: string,
): Promise<string> {
  const keyBytes = new Uint8Array(hexKey.length / 2);
  for (let i = 0; i < keyBytes.length; i++) {
    keyBytes[i] = Number.parseInt(hexKey.slice(i * 2, i * 2 + 2), 16);
  }
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(fields.join(":")) as BufferSource),
  );
  return btoa(String.fromCharCode(...digest));
}

describe("verifyStraumurHmac", () => {
  // 24-byte test key (matches the gisk-app reference vectors).
  const hexKey = "6e4d1ae6624af9e1c0686c6c4415fb110172e8f222f55757";
  const signed: [string, string, string, string, string, string, string] = [
    "",
    "TTM8R7M75KM528Q9",
    "118610369",
    "199000",
    "ISK",
    "",
    "true",
  ];

  it("accepts a valid payload whose missing fields arrive as the literal \"null\"", async () => {
    const hmacSignature = await sign(signed, hexKey);
    const ok = await verifyStraumurHmac(
      {
        checkoutReference: "null",
        payfacReference: "TTM8R7M75KM528Q9",
        merchantReference: "118610369",
        amount: "199000",
        currency: "ISK",
        reason: "null",
        success: "true",
        hmacSignature,
      },
      hexKey,
    );
    expect(ok).toBe(true);
  });

  it("accepts JSON null for missing fields", async () => {
    const hmacSignature = await sign(signed, hexKey);
    const ok = await verifyStraumurHmac(
      {
        payfacReference: "TTM8R7M75KM528Q9",
        merchantReference: "118610369",
        amount: "199000",
        currency: "ISK",
        success: "true",
        hmacSignature,
      },
      hexKey,
    );
    expect(ok).toBe(true);
  });

  it("rejects a tampered amount", async () => {
    const hmacSignature = await sign(signed, hexKey);
    const ok = await verifyStraumurHmac(
      {
        payfacReference: "TTM8R7M75KM528Q9",
        merchantReference: "118610369",
        amount: "999900", // tampered
        currency: "ISK",
        success: "true",
        hmacSignature,
      },
      hexKey,
    );
    expect(ok).toBe(false);
  });

  it("rejects a missing signature and the wire-format \"null\" signature", async () => {
    const base = {
      payfacReference: "TTM8R7M75KM528Q9",
      merchantReference: "118610369",
      amount: "199000",
      currency: "ISK",
      success: "true",
    };
    expect(await verifyStraumurHmac({ ...base, hmacSignature: null }, hexKey)).toBe(false);
    expect(await verifyStraumurHmac({ ...base, hmacSignature: "null" }, hexKey)).toBe(false);
  });

  it("rejects when the key is not valid hex (incl. partial-hex pairs)", async () => {
    const hmacSignature = await sign(signed, hexKey);
    const base = {
      payfacReference: "TTM8R7M75KM528Q9",
      merchantReference: "118610369",
      amount: "199000",
      currency: "ISK",
      success: "true",
      hmacSignature,
    };
    expect(await verifyStraumurHmac(base, "zzzz")).toBe(false);
    // "1g" is even-length and parseInt("1g",16) === 1 — must still be rejected as non-hex.
    expect(await verifyStraumurHmac(base, "1g")).toBe(false);
    // Odd length.
    expect(await verifyStraumurHmac(base, "abc")).toBe(false);
  });
});
