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

describe("GET /api/open-banking/callback", () => {
  it("rejects a state mismatch without resolving an intent", async () => {
    cookieStore.get.mockReturnValue({ value: "expected" })
    const res = await GET(req("code=c&state=WRONG"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("/accounts?bank=error")
    expect(consumeConnectIntent).not.toHaveBeenCalled()
  })

  it("redirects to error when the bank returned an error", async () => {
    cookieStore.get.mockReturnValue({ value: "s" })
    const res = await GET(req("error=access_denied&state=s"))
    expect(res.headers.get("location")).toContain("bank=error")
    expect(consumeConnectIntent).not.toHaveBeenCalled()
  })

  it("errors when the state has no matching intent (unknown/replayed)", async () => {
    cookieStore.get.mockReturnValue({ value: "s" })
    consumeConnectIntent.mockResolvedValue(null)
    const res = await GET(req("code=the-code&state=s"))
    expect(res.headers.get("location")).toContain("bank=error")
    expect(completeBankConnection).not.toHaveBeenCalled()
  })

  it("completes the connection using the intent's household — no session required", async () => {
    cookieStore.get.mockReturnValue({ value: "s" })
    consumeConnectIntent.mockResolvedValue({ householdId: "hh-9", institutionName: "Landsbankinn" })

    const res = await GET(req("code=the-code&state=s"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("/accounts?bank=connected")
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
