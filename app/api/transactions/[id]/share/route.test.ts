import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({
  requireHousehold: () => requireHousehold(),
}))

import { DELETE, PUT } from "./route"

const ID = "11111111-1111-1111-1111-111111111111"
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (method: string, body?: unknown) =>
  new Request("http://test/", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

function householdWith(
  transaction: unknown,
  rows: { id: string; ownShareAmount: number | null }[] = [
    { id: ID, ownShareAmount: -28_571 },
  ]
) {
  const setOwnShare = vi.fn().mockResolvedValue(rows)
  const record = vi.fn().mockResolvedValue([])
  return {
    setOwnShare,
    record,
    memberId: "member-1",
    user: { name: "Ada", email: "ada@x.is" },
    repo: {
      transactions: {
        findById: vi.fn().mockResolvedValue(transaction),
        setOwnShare,
      },
      activity: { record },
    },
  }
}

beforeEach(() => requireHousehold.mockReset())

describe("PUT /api/transactions/[id]/share", () => {
  it("400s a malformed id before resolving the household", async () => {
    const res = await PUT(req("PUT", { ownShareAmount: -1 }), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("400s a non-integer ownShareAmount", async () => {
    const res = await PUT(req("PUT", { ownShareAmount: -1.5 }), ctx(ID))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("400s a non-negative ownShareAmount (a zero share is Excluded instead)", async () => {
    const res = await PUT(req("PUT", { ownShareAmount: 0 }), ctx(ID))
    expect(res.status).toBe(400)
  })

  it("404s when the transaction is not in the household", async () => {
    requireHousehold.mockResolvedValue(householdWith(undefined))
    const res = await PUT(req("PUT", { ownShareAmount: -1 }), ctx(ID))
    expect(res.status).toBe(404)
  })

  it("400s sharing a credit (debit-only)", async () => {
    const h = householdWith({ id: ID, amount: 5_000, excluded: false })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT", { ownShareAmount: -1_000 }), ctx(ID))
    expect(res.status).toBe(400)
    expect(h.setOwnShare).not.toHaveBeenCalled()
  })

  it("409s sharing an excluded transaction (mutually exclusive)", async () => {
    const h = householdWith({ id: ID, amount: -5_000, excluded: true })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT", { ownShareAmount: -1_000 }), ctx(ID))
    expect(res.status).toBe(409)
    expect(h.setOwnShare).not.toHaveBeenCalled()
  })

  it("400s a share larger in magnitude than the charge", async () => {
    const h = householdWith({ id: ID, amount: -1_000, excluded: false })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT", { ownShareAmount: -2_000 }), ctx(ID))
    expect(res.status).toBe(400)
    expect(h.setOwnShare).not.toHaveBeenCalled()
  })

  it("400s a share equal to the full charge (a no-op, not a split)", async () => {
    const h = householdWith({ id: ID, amount: -1_000, excluded: false })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT", { ownShareAmount: -1_000 }), ctx(ID))
    expect(res.status).toBe(400)
    expect(h.setOwnShare).not.toHaveBeenCalled()
  })

  it("sets the Own share on a debit and echoes it back", async () => {
    const h = householdWith({ id: ID, amount: -200_000, excluded: false })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT", { ownShareAmount: -28_571 }), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.setOwnShare).toHaveBeenCalledWith(ID, -28_571)
    expect(h.record).toHaveBeenCalledWith({
      memberId: "member-1",
      actorName: "Ada",
      action: "transaction.share_set",
      payload: { transactionId: ID, merchant: undefined, amount: -200_000, ownShareAmount: -28_571 },
    })
    expect(await res.json()).toEqual({ id: ID, ownShareAmount: -28_571 })
  })

  it("409s when the row changes between the lookup and the guarded write", async () => {
    const h = householdWith({ id: ID, amount: -200_000, excluded: false }, [])
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT", { ownShareAmount: -28_571 }), ctx(ID))
    expect(res.status).toBe(409)
  })
})

describe("DELETE /api/transactions/[id]/share", () => {
  it("400s a malformed id before resolving the household", async () => {
    const res = await DELETE(req("DELETE"), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("404s when the transaction is not in the household", async () => {
    requireHousehold.mockResolvedValue(householdWith(undefined))
    const res = await DELETE(req("DELETE"), ctx(ID))
    expect(res.status).toBe(404)
  })

  it("clears the Own share", async () => {
    const h = householdWith({ id: ID, amount: -200_000, excluded: false }, [
      { id: ID, ownShareAmount: null },
    ])
    requireHousehold.mockResolvedValue(h)
    const res = await DELETE(req("DELETE"), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.setOwnShare).toHaveBeenCalledWith(ID, null)
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "transaction.share_cleared" }),
    )
    expect(await res.json()).toEqual({ id: ID, ownShareAmount: null })
  })

  it("does not log when clearing a share on a row that never had one (no-op)", async () => {
    const h = householdWith({ id: ID, amount: -200_000, excluded: false, ownShareAmount: null }, [
      { id: ID, ownShareAmount: null },
    ])
    requireHousehold.mockResolvedValue(h)
    const res = await DELETE(req("DELETE"), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.record).not.toHaveBeenCalled()
  })
})
