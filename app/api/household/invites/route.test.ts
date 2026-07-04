import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

const { createInvite, InviteError } = vi.hoisted(() => {
  class InviteError extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  return { createInvite: vi.fn(), InviteError }
})
vi.mock("@/lib/household/invites", () => ({
  createInvite: (...args: unknown[]) => createInvite(...args),
  InviteError,
  inviteErrorStatus: () => 402,
}))
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))

import { GET, POST } from "./route"

const postReq = (body: unknown) =>
  new Request("http://test/", { method: "POST", body: JSON.stringify(body) })

const EXPIRES = new Date("2026-08-01T00:00:00Z")

function householdCtx() {
  const record = vi.fn().mockResolvedValue([])
  return {
    record,
    ctx: {
      householdId: "h1",
      memberId: "m1",
      plan: "Premium",
      user: { name: "Ada", email: "ada@x.is" },
      repo: {
        activity: { record },
        invites: { listActive: vi.fn().mockResolvedValue([]) },
      },
    },
  }
}

beforeEach(() => {
  requireHousehold.mockReset()
  createInvite.mockReset()
})

describe("GET /api/household/invites", () => {
  it("returns the active invites (trimmed shape)", async () => {
    const { ctx } = householdCtx()
    ctx.repo.invites.listActive.mockResolvedValue([
      { id: "i1", email: "a@x.is", expiresAt: EXPIRES, createdAt: EXPIRES, tokenHash: "secret" },
    ])
    requireHousehold.mockResolvedValue(ctx)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: "i1", email: "a@x.is", expiresAt: EXPIRES.toISOString(), createdAt: EXPIRES.toISOString() },
    ])
  })
})

describe("POST /api/household/invites", () => {
  it("400s a missing email before resolving the household", async () => {
    const res = await POST(postReq({}))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("creates an invite, logs invite.created, and returns 201", async () => {
    const { ctx, record } = householdCtx()
    requireHousehold.mockResolvedValue(ctx)
    createInvite.mockResolvedValue({ rawToken: "tok123", expiresAt: EXPIRES })

    const res = await POST(postReq({ email: "invitee@x.is" }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      token: "tok123",
      path: "/join/tok123",
      expiresAt: EXPIRES.toISOString(),
    })
    expect(record).toHaveBeenCalledWith({
      memberId: "m1",
      actorName: "Ada",
      action: "invite.created",
      payload: { email: "invitee@x.is", expiresAt: EXPIRES },
    })
  })

  it("still returns the one-time token (201) even if the audit log write fails", async () => {
    const { ctx, record } = householdCtx()
    record.mockRejectedValue(new Error("db blip"))
    requireHousehold.mockResolvedValue(ctx)
    createInvite.mockResolvedValue({ rawToken: "tok123", expiresAt: EXPIRES })
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    const res = await POST(postReq({ email: "invitee@x.is" }))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ token: "tok123", path: "/join/tok123" })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it("maps an InviteError to its status and does not log", async () => {
    const { ctx, record } = householdCtx()
    requireHousehold.mockResolvedValue(ctx)
    createInvite.mockRejectedValue(new InviteError("seat_limit"))

    const res = await POST(postReq({ email: "invitee@x.is" }))
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual({ error: "seat_limit" })
    expect(record).not.toHaveBeenCalled()
  })
})
