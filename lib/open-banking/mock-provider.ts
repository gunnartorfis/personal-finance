import type {
  AuthStart,
  IngestionProvider,
  Institution,
  ProviderSession,
  ProviderTransaction,
  StartAuthParams,
} from "./provider";

/** Canned data for {@link MockIngestionProvider}. */
export interface MockProviderData {
  institutions?: Institution[];
  session?: ProviderSession;
  transactions?: ProviderTransaction[];
  sessionStatus?: string;
}

const DEFAULT_SESSION: ProviderSession = {
  sessionId: "mock-session",
  accounts: [],
  consentValidUntil: "2099-01-01T00:00:00Z",
};

/**
 * An in-memory {@link IngestionProvider} returning canned data (slice #112). Lets the connect-flow
 * and sync slices — and this app's tests / local dev — run the whole pipeline without live
 * Enable Banking credentials.
 */
export class MockIngestionProvider implements IngestionProvider {
  readonly name = "mock";

  constructor(private readonly data: MockProviderData) {}

  async listInstitutions(): Promise<Institution[]> {
    return this.data.institutions ?? [];
  }

  async startAuth(params: StartAuthParams): Promise<AuthStart> {
    return {
      url: `https://mock.local/auth?state=${encodeURIComponent(params.state)}`,
      authorizationId: `mock-auth-${params.state}`,
    };
  }

  async authorizeSession(): Promise<ProviderSession> {
    return this.data.session ?? DEFAULT_SESSION;
  }

  async getSession(): Promise<{ status: string; consentValidUntil: string }> {
    return {
      status: this.data.sessionStatus ?? "AUTHORIZED",
      consentValidUntil: (this.data.session ?? DEFAULT_SESSION).consentValidUntil,
    };
  }

  async listTransactions(): Promise<ProviderTransaction[]> {
    return this.data.transactions ?? [];
  }
}
