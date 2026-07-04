import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { DELETE } from "./route"

const ID = "11111111-1111-1111-1111-111111111111"
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => requireHousehold.mockReset())

describe("DELETE /api/merchant-rules/[id]", () => {
  it("400s a malformed id before resolving the household", async () => {
    const res = await DELETE(new Request("http://test/", { method: "DELETE" }), ctx("nope"))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("404s when no rule was removed (unknown or other-tenant id)", async () => {
    const remove = vi.fn().mockResolvedValue([])
    requireHousehold.mockResolvedValue({ repo: { merchantRules: { remove } } })

    const res = await DELETE(new Request("http://test/", { method: "DELETE" }), ctx(ID))
    expect(res.status).toBe(404)
    expect(remove).toHaveBeenCalledWith(ID)
  })

  it("removes the rule and logs it", async () => {
    const remove = vi.fn().mockResolvedValue([{ id: ID, merchant: "NETFLIX" }])
    const record = vi.fn().mockResolvedValue([])
    requireHousehold.mockResolvedValue({
      repo: { merchantRules: { remove }, activity: { record } },
      memberId: "m1",
      user: { name: "Ada", email: "a@x.is" },
    })

    const res = await DELETE(new Request("http://test/", { method: "DELETE" }), ctx(ID))
    expect(res.status).toBe(200)
    expect(record).toHaveBeenCalledWith({
      memberId: "m1",
      actorName: "Ada",
      action: "rule.deleted",
      payload: { ruleId: ID, merchant: "NETFLIX" },
    })
    expect(await res.json()).toEqual({ removed: true })
  })
})
