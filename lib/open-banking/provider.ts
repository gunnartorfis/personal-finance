/**
 * Provider-agnostic open-banking (AIS) interface (Phase K / #95, slice #112).
 *
 * The dashboard talks to banks only through this adapter, so the aggregator (Enable Banking today,
 * possibly Salt Edge later) is swappable and every downstream slice — connect flow, sync — can be
 * built and tested against a mock. Amounts are the aggregator's native decimal in the account
 * currency (signed: debits negative); the sync slice converts them to the Household's billing
 * currency and integer minor-unit convention.
 */

/** A bank/ASPSP the aggregator can connect to. */
export interface Institution {
  name: string;
  country: string;
  bic?: string;
  logo?: string;
}

/** One bank account exposed by a connection. `uid` is the aggregator's handle for later reads. */
export interface ProviderAccount {
  uid: string;
  iban?: string;
  name?: string;
  currency: string;
  type?: string;
}

/** A normalized transaction from the aggregator. `amount` is signed (debit negative). */
export interface ProviderTransaction {
  externalId: string;
  date: string;
  amount: number;
  currency: string;
  merchant: string;
  reference: string | null;
}

/** The redirect that begins user authorization (SCA) at the bank. */
export interface AuthStart {
  url: string;
  authorizationId: string;
}

/** An authorized consent session and the accounts it exposes. */
export interface ProviderSession {
  sessionId: string;
  accounts: ProviderAccount[];
  consentValidUntil: string;
}

/** Parameters to begin authorization for one institution. */
export interface StartAuthParams {
  institution: { name: string; country: string };
  state: string;
  redirectUrl: string;
  /** RFC3339 datetime the consent should stay valid until (bank-capped). */
  validUntil: string;
}

/**
 * The AIS operations the app needs: discover banks, start consent, exchange the callback code for a
 * session, poll a session's status, and read an account's transactions over a date range.
 */
export interface IngestionProvider {
  readonly name: string;
  listInstitutions(country: string): Promise<Institution[]>;
  startAuth(params: StartAuthParams): Promise<AuthStart>;
  authorizeSession(code: string): Promise<ProviderSession>;
  getSession(sessionId: string): Promise<{ status: string; consentValidUntil: string }>;
  listTransactions(
    accountUid: string,
    range: { from: string; to: string },
  ): Promise<ProviderTransaction[]>;
}
