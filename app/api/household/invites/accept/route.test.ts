import { beforeEach, describe, expect, it, vi } from "vitest"

const { getCurrentUser, acceptInvite, InviteError, record, householdRepoMock } = vi.hoisted(() => {
  class InviteError extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  const record = vi.fn()
  return {
    getCurrentUser: vi.fn(),
    acceptInvite: vi.fn(),
    InviteError,
    record,
    householdRepoMock: vi.fn<(...args: unknown[]) => { activity: { record: typeof record } }>(
      () => ({ activity: { record } }),
    ),
  }
})
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }))
vi.mock("@/lib/household/invites", () => ({
  acceptInvite: (...a: unknown[]) => acceptInvite(...a),
  InviteError,
  inviteErrorStatus: () => 409,
}))
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))
vi.mock("@/lib/db/household-repo", () => ({ householdRepo: (...a: unknown[]) => householdRepoMock(...a) }))

import { POST } from "./route"

const USER = { id: "u1", email: "ada@x.is", name: "Ada", emailVerified: true }
const req = (body: unknown) =>
  new Request("http://test/", { method: "POST", body: JSON.stringify(body) })

beforeEach(() => {
  getCurrentUser.mockReset()
  acceptInvite.mockReset()
  record.mockReset().mockResolvedValue([])
  householdRepoMock.mockClear()
})

describe("POST /api/household/invites/accept", () => {
  it("401s when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null)
    const res = await POST(req({ token: "t" }))
    expect(res.status).toBe(401)
    expect(acceptInvite).not.toHaveBeenCalled()
  })

  it("400s when neither token nor inviteId is given", async () => {
    getCurrentUser.mockResolvedValue(USER)
    const res = await POST(req({}))
    expect(res.status).toBe(400)
    expect(acceptInvite).not.toHaveBeenCalled()
  })

  it("logs invite.accepted into the joined household on a fresh join", async () => {
    getCurrentUser.mockResolvedValue(USER)
    acceptInvite.mockResolvedValue({ householdId: "h1", memberId: "m9", joined: true })

    const res = await POST(req({ token: "tok" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, householdId: "h1" })
    expect(householdRepoMock).toHaveBeenCalledWith(expect.anything(), "h1")
    expect(record).toHaveBeenCalledWith({
      memberId: "m9",
      actorName: "Ada",
      action: "invite.accepted",
    })
  })

  it("does not log on an idempotent re-accept (joined=false)", async () => {
    getCurrentUser.mockResolvedValue(USER)
    acceptInvite.mockResolvedValue({ householdId: "h1", memberId: "m9", joined: false })

    const res = await POST(req({ token: "tok" }))
    expect(res.status).toBe(200)
    expect(record).not.toHaveBeenCalled()
  })

  it("still returns 200 if the audit log write fails on a fresh join", async () => {
    getCurrentUser.mockResolvedValue(USER)
    acceptInvite.mockResolvedValue({ householdId: "h1", memberId: "m9", joined: true })
    record.mockRejectedValue(new Error("db blip"))
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    const res = await POST(req({ token: "tok" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, householdId: "h1" })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it("maps an InviteError to its status and does not log", async () => {
    getCurrentUser.mockResolvedValue(USER)
    acceptInvite.mockRejectedValue(new InviteError("not_pending"))

    const res = await POST(req({ token: "tok" }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "not_pending" })
    expect(record).not.toHaveBeenCalled()
  })
})
