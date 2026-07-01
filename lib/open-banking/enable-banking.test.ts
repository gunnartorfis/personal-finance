import { generateKeyPairSync } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { EnableBankingClient } from "./enable-banking";

let privateKey: string;

beforeAll(() => {
  const { privateKey: key } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  privateKey = key.export({ type: "pkcs8", format: "pem" }).toString();
});

function decodeJwt(token: string) {
  const [h, p] = token.split(".");
  const dec = (s: string) =>
    JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  return { header: dec(h), payload: dec(p) };
}

/** A fetch stub that returns canned JSON and records calls. `handler(url, init) => body`. */
function stubFetch(handler: (url: string, init: RequestInit) => unknown, ok = true, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return { ok, status, json: async () => handler(url, init) } as unknown as Response;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function client(fetchFn: typeof fetch) {
  return new EnableBankingClient({ applicationId: "app-123", privateKey, fetch: fetchFn });
}

describe("EnableBankingClient", () => {
  it("signs requests with an RS256 JWT bearer carrying the application id as kid", async () => {
    const { fn, calls } = stubFetch(() => ({ aspsps: [] }));
    await client(fn).listInstitutions("IS");
    const auth = (calls[0].init.headers as Record<string, string>).Authorization;
    expect(auth).toMatch(/^Bearer /);
    const { header, payload } = decodeJwt(auth.slice("Bearer ".length));
    expect(header).toMatchObject({ alg: "RS256", typ: "JWT", kid: "app-123" });
    expect(payload).toMatchObject({ iss: "enablebanking.com", aud: "api.enablebanking.com" });
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("lists institutions for a country", async () => {
    const { fn, calls } = stubFetch(() => ({
      aspsps: [{ name: "Landsbankinn", country: "IS", bic: "NBIIISRE", logo: "https://l.png" }],
    }));
    const banks = await client(fn).listInstitutions("IS");
    expect(calls[0].url).toContain("/aspsps?country=IS");
    expect(banks).toEqual([
      { name: "Landsbankinn", country: "IS", bic: "NBIIISRE", logo: "https://l.png" },
    ]);
  });

  it("starts authorization and returns the redirect url + authorization id", async () => {
    const { fn, calls } = stubFetch(() => ({
      url: "https://bank.example/auth?x=1",
      authorization_id: "auth-1",
      psu_id_hash: "h",
    }));
    const res = await client(fn).startAuth({
      institution: { name: "Landsbankinn", country: "IS" },
      state: "st",
      redirectUrl: "https://app.example/callback",
      validUntil: "2026-06-01T00:00:00Z",
    });
    expect(calls[0].url).toContain("/auth");
    expect(calls[0].init.method).toBe("POST");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({
      aspsp: { name: "Landsbankinn", country: "IS" },
      state: "st",
      redirect_url: "https://app.example/callback",
      psu_type: "personal",
      access: { valid_until: "2026-06-01T00:00:00Z", balances: true, transactions: true },
    });
    expect(res).toEqual({ url: "https://bank.example/auth?x=1", authorizationId: "auth-1" });
  });

  it("authorizes a session from a code and maps its accounts", async () => {
    const { fn, calls } = stubFetch(() => ({
      session_id: "sess-1",
      access: { valid_until: "2026-06-01T00:00:00Z" },
      accounts: [
        {
          uid: "acc-uid-1",
          account_id: { iban: "IS00" },
          name: "Debit",
          currency: "ISK",
          cash_account_type: "CACC",
        },
      ],
    }));
    const session = await client(fn).authorizeSession("the-code");
    expect(calls[0].url).toContain("/sessions");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ code: "the-code" });
    expect(session).toEqual({
      sessionId: "sess-1",
      consentValidUntil: "2026-06-01T00:00:00Z",
      accounts: [{ uid: "acc-uid-1", iban: "IS00", name: "Debit", currency: "ISK", type: "CACC" }],
    });
  });

  it("lists transactions with signed amounts and follows continuation-key pagination", async () => {
    const page1 = {
      transactions: [
        {
          transaction_id: "t1",
          booking_date: "2026-03-01",
          transaction_amount: { amount: "1990.00", currency: "ISK" },
          credit_debit_indicator: "DBTN",
          creditor: { name: "NETFLIX" },
          remittance_information: ["Netflix"],
        },
      ],
      continuation_key: "c2",
    };
    const page2 = {
      transactions: [
        {
          transaction_id: "t2",
          booking_date: "2026-03-02",
          transaction_amount: { amount: "5000.00", currency: "ISK" },
          credit_debit_indicator: "CRDT",
          debtor: { name: "SALARY" },
          remittance_information: [],
        },
      ],
    };
    const { fn, calls } = stubFetch((url) => (url.includes("continuation_key=c2") ? page2 : page1));
    const txns = await client(fn).listTransactions("acc-uid-1", {
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(calls[0].url).toContain("/accounts/acc-uid-1/transactions");
    expect(calls[0].url).toContain("date_from=2026-01-01");
    expect(calls[0].url).toContain("date_to=2026-03-31");
    expect(calls[1].url).toContain("continuation_key=c2");
    expect(txns).toEqual([
      { externalId: "t1", date: "2026-03-01", amount: -1990, currency: "ISK", merchant: "NETFLIX", reference: "Netflix" },
      { externalId: "t2", date: "2026-03-02", amount: 5000, currency: "ISK", merchant: "SALARY", reference: null },
    ]);
  });

  it("throws on a non-ok response", async () => {
    const { fn } = stubFetch(() => ({ error: "boom" }), false, 500);
    await expect(client(fn).listInstitutions("IS")).rejects.toThrow();
  });
});
