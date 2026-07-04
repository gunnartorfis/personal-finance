import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

const { leaveHousehold, LeaveError } = vi.hoisted(() => {
  class LeaveError extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  return { leaveHousehold: vi.fn(), LeaveError }
})
vi.mock("@/lib/household/membership", () => ({
  leaveHousehold: (...args: unknown[]) => leaveHousehold(...args),
  LeaveError,
}))
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))

import { POST } from "./route"

function householdCtx() {
  const record = vi.fn().mockResolvedValue([])
  return {
    record,
    ctx: {
      householdId: "h1",
      memberId: "m1",
      user: { name: "Ada", email: "ada@x.is" },
      repo: { activity: { record } },
    },
  }
}

beforeEach(() => {
  requireHousehold.mockReset()
  leaveHousehold.mockReset()
})

describe("POST /api/household/leave", () => {
  it("leaves the household and logs member.left", async () => {
    const { ctx, record } = householdCtx()
    requireHousehold.mockResolvedValue(ctx)
    leaveHousehold.mockResolvedValue(undefined)

    const res = await POST()
    expect(res.status).toBe(200)
    expect(leaveHousehold).toHaveBeenCalledWith(expect.anything(), "h1", "m1")
    expect(record).toHaveBeenCalledWith({
      memberId: "m1",
      actorName: "Ada",
      action: "member.left",
    })
  })

  it("409s the last member (LeaveError) and does not log", async () => {
    const { ctx, record } = householdCtx()
    requireHousehold.mockResolvedValue(ctx)
    leaveHousehold.mockRejectedValue(new LeaveError("last_member"))

    const res = await POST()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "last_member" })
    expect(record).not.toHaveBeenCalled()
  })
})
