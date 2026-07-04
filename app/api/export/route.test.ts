import { describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { GET } from "./route"

function repoStub() {
  const list = () => vi.fn().mockResolvedValue([])
  return {
    accounts: { list: vi.fn().mockResolvedValue([{ id: "a1", name: "Visa" }]), balances: { list: list() } },
    uploads: { list: list() },
    transactions: { list: vi.fn().mockResolvedValue([{ id: "t1", amount: -100 }]) },
    overrides: { list: list() },
    merchantRules: { list: list() },
    bankConnections: {
      list: vi.fn().mockResolvedValue([
        { id: "c1", provider: "enable_banking", accessToken: "SECRET-A", refreshToken: "SECRET-R" },
      ]),
    },
    savings: {
      goal: { get: vi.fn().mockResolvedValue(undefined) },
      incomeSources: { list: list() },
      offcardCosts: { list: list() },
      oneOffAdjustments: { list: list() },
    },
    budgets: { list: list() },
  }
}

describe("GET /api/export", () => {
  it("returns a JSON attachment with the household's data and no bank tokens", async () => {
    const record = vi.fn().mockResolvedValue([])
    const repo = repoStub() as ReturnType<typeof repoStub> & { activity: { record: typeof record } }
    repo.activity = { record }
    requireHousehold.mockResolvedValue({
      householdId: "h1",
      memberId: "m1",
      user: { name: "Ada", email: "ada@x.is" },
      repo,
    })

    const res = await GET()
    expect(record).toHaveBeenCalledWith({
      memberId: "m1",
      actorName: "Ada",
      action: "data.exported",
    })
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(res.headers.get("content-disposition")).toContain("attachment")
    expect(res.headers.get("cache-control")).toContain("no-store")

    const text = await res.text()
    expect(text).not.toContain("SECRET-A")
    expect(text).not.toContain("SECRET-R")

    const body = JSON.parse(text)
    expect(body.householdId).toBe("h1")
    expect(body.data.accounts).toEqual([{ id: "a1", name: "Visa" }])
    expect(body.data.transactions).toEqual([{ id: "t1", amount: -100 }])
    expect(body.data.bankConnections[0]).toMatchObject({ id: "c1", provider: "enable_banking" })
    expect(body.data.bankConnections[0]).not.toHaveProperty("accessToken")
  })
})
