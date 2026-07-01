import { createSign } from "node:crypto";

import type {
  AuthStart,
  IngestionProvider,
  Institution,
  ProviderAccount,
  ProviderSession,
  ProviderTransaction,
  StartAuthParams,
} from "./provider";

const DEFAULT_BASE_URL = "https://api.enablebanking.com";
/** JWT lifetime; Enable Banking caps app JWTs at 24h, this is comfortably short. */
const JWT_TTL_SECONDS = 3600;
/** Safety cap on transaction pagination to bound memory/latency on an anomalous response. */
const MAX_TRANSACTION_PAGES = 100;

/** Config for {@link EnableBankingClient}. `privateKey` is the app's RSA private key (PEM). */
export interface EnableBankingConfig {
  applicationId: string;
  privateKey: string;
  baseUrl?: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  /** Injectable clock (ms) for deterministic JWT timestamps in tests. */
  now?: () => number;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

// ---- Enable Banking wire shapes (only the fields we consume) --------------------------------
interface EbAspsp {
  name: string;
  country: string;
  bic?: string;
  logo?: string;
}
interface EbAccount {
  uid: string;
  account_id?: { iban?: string };
  name?: string;
  currency: string;
  cash_account_type?: string;
}
interface EbTransaction {
  transaction_id: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[];
  entry_reference?: string;
}

/**
 * Enable Banking AIS client (slice #112). Framework-agnostic; talks to the documented REST API with
 * an RS256 JWT signed by the app's private key (`kid` = application id). Injectable `fetch`/`now` keep
 * it unit-testable without live credentials — real sandbox verification is a later human step.
 */
export class EnableBankingClient implements IngestionProvider {
  readonly name = "enable_banking";
  private readonly cfg: Required<Omit<EnableBankingConfig, "baseUrl">> & { baseUrl: string };

  constructor(config: EnableBankingConfig) {
    this.cfg = {
      applicationId: config.applicationId,
      privateKey: config.privateKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      fetch: config.fetch ?? fetch,
      now: config.now ?? Date.now,
    };
  }

  private jwt(): string {
    const iat = Math.floor(this.cfg.now() / 1000);
    const header = base64url(
      JSON.stringify({ typ: "JWT", alg: "RS256", kid: this.cfg.applicationId }),
    );
    const payload = base64url(
      JSON.stringify({
        iss: "enablebanking.com",
        aud: "api.enablebanking.com",
        iat,
        exp: iat + JWT_TTL_SECONDS,
      }),
    );
    const signingInput = `${header}.${payload}`;
    const signature = createSign("RSA-SHA256")
      .update(signingInput)
      .sign(this.cfg.privateKey)
      .toString("base64url");
    return `${signingInput}.${signature}`;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { query?: Record<string, string | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(`${this.cfg.baseUrl}${path}`);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    const res = await this.cfg.fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.jwt()}`,
        "Content-Type": "application/json",
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    if (!res.ok) {
      throw new Error(`Enable Banking ${method} ${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async listInstitutions(country: string): Promise<Institution[]> {
    const data = await this.request<{ aspsps: EbAspsp[] }>("GET", "/aspsps", {
      query: { country },
    });
    return data.aspsps.map((a) => ({
      name: a.name,
      country: a.country,
      bic: a.bic,
      logo: a.logo,
    }));
  }

  async startAuth(params: StartAuthParams): Promise<AuthStart> {
    const data = await this.request<{ url: string; authorization_id: string }>("POST", "/auth", {
      body: {
        aspsp: params.institution,
        state: params.state,
        redirect_url: params.redirectUrl,
        psu_type: "personal",
        access: { valid_until: params.validUntil, balances: true, transactions: true },
      },
    });
    return { url: data.url, authorizationId: data.authorization_id };
  }

  async authorizeSession(code: string): Promise<ProviderSession> {
    const data = await this.request<{
      session_id: string;
      accounts: EbAccount[];
      access: { valid_until: string };
    }>("POST", "/sessions", { body: { code } });
    return {
      sessionId: data.session_id,
      consentValidUntil: data.access.valid_until,
      accounts: data.accounts.map(toProviderAccount),
    };
  }

  async getSession(sessionId: string): Promise<{ status: string; consentValidUntil: string }> {
    const data = await this.request<{ status: string; access: { valid_until: string } }>(
      "GET",
      `/sessions/${sessionId}`,
    );
    return { status: data.status, consentValidUntil: data.access.valid_until };
  }

  async listTransactions(
    accountUid: string,
    range: { from: string; to: string },
  ): Promise<ProviderTransaction[]> {
    const out: ProviderTransaction[] = [];
    let continuationKey: string | undefined;
    let pages = 0;
    do {
      if (pages >= MAX_TRANSACTION_PAGES) {
        throw new Error(
          `Enable Banking transactions exceeded ${MAX_TRANSACTION_PAGES} pages for account ${accountUid}`,
        );
      }
      const data = await this.request<{
        transactions: EbTransaction[];
        continuation_key?: string;
      }>("GET", `/accounts/${accountUid}/transactions`, {
        query: { date_from: range.from, date_to: range.to, continuation_key: continuationKey },
      });
      out.push(...data.transactions.map(toProviderTransaction));
      continuationKey = data.continuation_key;
      pages += 1;
    } while (continuationKey);
    return out;
  }
}

function toProviderAccount(a: EbAccount): ProviderAccount {
  return {
    uid: a.uid,
    iban: a.account_id?.iban,
    name: a.name,
    currency: a.currency,
    type: a.cash_account_type,
  };
}

function toProviderTransaction(t: EbTransaction): ProviderTransaction {
  const magnitude = Number.parseFloat(t.transaction_amount.amount);
  const amount = t.credit_debit_indicator === "DBIT" ? -magnitude : magnitude;
  const counterparty =
    t.credit_debit_indicator === "DBIT" ? t.creditor?.name : t.debtor?.name;
  const remittance = t.remittance_information ?? [];
  return {
    externalId: t.transaction_id,
    date: t.booking_date ?? t.value_date ?? t.transaction_date ?? "",
    amount,
    currency: t.transaction_amount.currency,
    merchant: counterparty ?? remittance[0] ?? t.entry_reference ?? "",
    reference: remittance.length > 0 ? remittance.join(" ") : null,
  };
}
