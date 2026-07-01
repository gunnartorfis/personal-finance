import { describe, expect, it } from "vitest";

import { MockIngestionProvider } from "./mock-provider";
import type { IngestionProvider, ProviderTransaction } from "./provider";

const txns: ProviderTransaction[] = [
  { externalId: "t1", date: "2026-03-01", amount: -1990, currency: "ISK", merchant: "NETFLIX", reference: null },
];

describe("MockIngestionProvider", () => {
  it("returns the canned institutions, session, and transactions", async () => {
    const provider: IngestionProvider = new MockIngestionProvider({
      institutions: [{ name: "Landsbankinn", country: "IS" }],
      session: {
        sessionId: "s1",
        consentValidUntil: "2026-06-01T00:00:00Z",
        accounts: [{ uid: "a1", currency: "ISK" }],
      },
      transactions: txns,
    });

    expect(provider.name).toBe("mock");
    expect(await provider.listInstitutions("IS")).toHaveLength(1);
    const session = await provider.authorizeSession("code");
    expect(session.sessionId).toBe("s1");
    expect(session.accounts[0].uid).toBe("a1");
    expect(await provider.listTransactions("a1", { from: "2026-01-01", to: "2026-03-31" })).toEqual(txns);
  });

  it("startAuth returns a deterministic redirect echoing the state", async () => {
    const provider: IngestionProvider = new MockIngestionProvider({});
    const res = await provider.startAuth({
      institution: { name: "X", country: "IS" },
      state: "abc",
      redirectUrl: "https://app/cb",
      validUntil: "2026-06-01T00:00:00Z",
    });
    expect(res.authorizationId).toBeTruthy();
    expect(res.url).toContain("abc");
  });
});
