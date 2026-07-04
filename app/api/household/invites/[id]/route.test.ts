import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { DELETE } from "./route"

const ID = "11111111-1111-1111-1111-111111111111"
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = () => new Request("http://test/", { method: "DELETE" })

function householdWith(revoked: unknown) {
  const revoke = vi.fn().mockResolvedValue(revoked === undefined ? [] : [revoked])
  const record = vi.fn().mockResolvedValue([])
  return {
    revoke,
    record,
    repo: { invites: { revoke }, activity: { record } },
    memberId: "m1",
    user: { name: "Ada", email: "ada@x.is" },
  }
}

beforeEach(() => requireHousehold.mockReset())

describe("DELETE /api/household/invites/[id]", () => {
  it("404s when nothing was revoked and does not log", async () => {
    const h = householdWith(undefined)
    requireHousehold.mockResolvedValue(h)
    const res = await DELETE(req(), ctx(ID))
    expect(res.status).toBe(404)
    expect(h.revoke).toHaveBeenCalledWith(ID)
    expect(h.record).not.toHaveBeenCalled()
  })

  it("revokes a pending invite and logs invite.revoked", async () => {
    const h = householdWith({ id: ID, email: "invitee@x.is" })
    requireHousehold.mockResolvedValue(h)
    const res = await DELETE(req(), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.record).toHaveBeenCalledWith({
      memberId: "m1",
      actorName: "Ada",
      action: "invite.revoked",
      payload: { inviteId: ID, email: "invitee@x.is" },
    })
  })
})
