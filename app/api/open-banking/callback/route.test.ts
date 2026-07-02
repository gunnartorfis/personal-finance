import { beforeEach, describe, expect, it, vi } from "vitest"

const { requireHousehold, getIngestionProvider, completeBankConnection, cookieStore } = vi.hoisted(
  () => ({
    requireHousehold: vi.fn(),
    getIngestionProvider: vi.fn(),
    completeBankConnection: vi.fn(),
    cookieStore: { get: vi.fn(), delete: vi.fn() },
  }),
)

vi.mock("@/lib/household/current", () => ({ requireHousehold }))
vi.mock("@/lib/open-banking/provider-factory", () => ({ getIngestionProvider }))
vi.mock("@/lib/open-banking/connect", () => ({ completeBankConnection }))
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }))

import { STATE_COOKIE } from "../connect/route"
import { GET } from "./route"

const req = (qs: string) => new Request(`http://test/api/open-banking/callback?${qs}`)

beforeEach(() => {
  requireHousehold.mockReset()
  getIngestionProvider.mockReset()
  completeBankConnection.mockReset()
  cookieStore.get.mockReset()
  cookieStore.delete.mockReset()
})

describe("GET /api/open-banking/callback", () => {
  it("rejects a state mismatch without touching the household or provider", async () => {
    cookieStore.get.mockReturnValue({ value: "expected" })
    const res = await GET(req("code=c&state=WRONG"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("/accounts?bank=error")
    expect(completeBankConnection).not.toHaveBeenCalled()
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("redirects to an error when the bank returned an error", async () => {
    cookieStore.get.mockReturnValue({ value: "s" })
    const res = await GET(req("error=access_denied&state=s"))
    expect(res.headers.get("location")).toContain("bank=error")
    expect(completeBankConnection).not.toHaveBeenCalled()
  })

  it("completes the connection and redirects on a valid callback", async () => {
    cookieStore.get.mockReturnValue({ value: "s" })
    requireHousehold.mockResolvedValue({ repo: { tag: "repo" } })
    getIngestionProvider.mockReturnValue({ name: "enable_banking" })
    completeBankConnection.mockResolvedValue({ connectionId: "c1", accountIds: ["a1"] })

    const res = await GET(req("code=the-code&state=s"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("/accounts?bank=connected")
    expect(completeBankConnection).toHaveBeenCalledWith({
      repo: { tag: "repo" },
      provider: { name: "enable_banking" },
      code: "the-code",
    })
    expect(cookieStore.delete).toHaveBeenCalledWith(STATE_COOKIE)
  })
})
