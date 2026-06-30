import { describe, expect, it } from "vitest";

import { normalizeStraumurField, toStraumurWireAmount, verifyStraumurHmac } from "./straumur";

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

  it("rejects when the key is not valid hex", async () => {
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
      "zzzz",
    );
    expect(ok).toBe(false);
  });
});
