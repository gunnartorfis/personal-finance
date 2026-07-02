import { beforeEach, describe, expect, it, vi } from "vitest"

const { getIngestionProvider, completeBankConnection, consumeConnectIntent, householdRepo, cookieStore } =
  vi.hoisted(() => ({
    getIngestionProvider: vi.fn(),
    completeBankConnection: vi.fn(),
    consumeConnectIntent: vi.fn(),
    householdRepo: vi.fn(),
    cookieStore: { get: vi.fn(), delete: vi.fn(), getAll: vi.fn(() => []) },
  }))

vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))
vi.mock("@/lib/db/household-repo", () => ({ householdRepo }))
vi.mock("@/lib/open-banking/provider-factory", () => ({ getIngestionProvider }))
vi.mock("@/lib/open-banking/connect", () => ({ completeBankConnection }))
vi.mock("@/lib/open-banking/connect-intent", () => ({
  consumeConnectIntent,
  STATE_COOKIE: "ob_connect_state",
}))
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }))

import { GET } from "./route"

const req = (qs: string) => new Request(`http://test/api/open-banking/callback?${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  getIngestionProvider.mockReturnValue({ name: "enable_banking" })
  householdRepo.mockReturnValue({ tag: "repo" })
  completeBankConnection.mockResolvedValue({ connectionId: "c1", accountIds: ["a1"] })
})

/** The callback returns a same-origin HTML interstitial (200) that navigates client-side, so a
 * SameSite=Strict session cookie rides along to the auth-gated /accounts page. Assert on the body. */
const landsOn = async (res: Response, target: string) => {
  expect(res.status).toBe(200)
  expect(res.headers.get("content-type")).toContain("text/html")
  // OAuth callback responses must not be cached (replay protection).
  expect(res.headers.get("cache-control")).toBe("no-store")
  const html = await res.text()
  // Assert the full absolute URL so a wrong scheme/origin would fail, not just the path fragment.
  expect(html).toContain(`http://test${target}`)
  // Client-initiated navigation (not an HTTP redirect), so no Location header.
  expect(res.headers.get("location")).toBeNull()
}

describe("GET /api/open-banking/callback", () => {
  it("rejects a state mismatch without resolving an intent", async () => {
    cookieStore.get.mockReturnValue({ value: "expected" })
    const res = await GET(req("code=c&state=WRONG"))
    await landsOn(res, "/accounts?bank=error")
    expect(consumeConnectIntent).not.toHaveBeenCalled()
  })

  it("lands on error when the bank returned an error", async () => {
    cookieStore.get.mockReturnValue({ value: "s" })
    const res = await GET(req("error=access_denied&state=s"))
    await landsOn(res, "/accounts?bank=error")
    expect(consumeConnectIntent).not.toHaveBeenCalled()
  })

  it("errors when the state has no matching intent (unknown/replayed)", async () => {
    cookieStore.get.mockReturnValue({ value: "s" })
    consumeConnectIntent.mockResolvedValue(null)
    const res = await GET(req("code=the-code&state=s"))
    await landsOn(res, "/accounts?bank=error")
    expect(completeBankConnection).not.toHaveBeenCalled()
  })

  it("completes the connection using the intent's household — no session required", async () => {
    cookieStore.get.mockReturnValue({ value: "s" })
    consumeConnectIntent.mockResolvedValue({ householdId: "hh-9", institutionName: "Landsbankinn" })

    const res = await GET(req("code=the-code&state=s"))
    await landsOn(res, "/accounts?bank=connected")
    expect(householdRepo).toHaveBeenCalledWith(expect.anything(), "hh-9")
    expect(completeBankConnection).toHaveBeenCalledWith({
      repo: { tag: "repo" },
      provider: { name: "enable_banking" },
      code: "the-code",
      institutionName: "Landsbankinn",
    })
    expect(cookieStore.delete).toHaveBeenCalledWith("ob_connect_state")
  })
})
