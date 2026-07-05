import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { DELETE, PUT } from "./route"

const ID = "11111111-1111-1111-1111-111111111111"
const CAT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" // a visible leaf in the mock
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const putReq = (body: unknown) =>
  new Request("http://test/", { method: "PUT", body: JSON.stringify(body) })

function householdWith(transaction: unknown) {
  const upsert = vi.fn().mockResolvedValue([{ id: "ov1", expenseType: "Fixed" }])
  const remove = vi.fn().mockResolvedValue([{ id: "ov1" }])
  const record = vi.fn().mockResolvedValue([])
  const leafSlugToId = vi.fn().mockResolvedValue(new Map([["groceries", CAT_ID]]))
  return {
    memberId: "mem1",
    user: { name: "Ada", email: "ada@x.is" },
    upsert,
    remove,
    record,
    repo: {
      transactions: { findById: vi.fn().mockResolvedValue(transaction) },
      overrides: { upsert, remove },
      categories: { leafSlugToId },
      activity: { record },
    },
  }
}

beforeEach(() => requireHousehold.mockReset())

describe("PUT /api/transactions/[id]/override", () => {
  it("400s a malformed id before resolving the household", async () => {
    const res = await PUT(putReq({ expenseType: "Fixed" }), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("400s an invalid expenseType", async () => {
    const res = await PUT(putReq({ expenseType: "Splurge" }), ctx(ID))
    expect(res.status).toBe(400)
  })

  it("404s when the transaction is not in the household", async () => {
    requireHousehold.mockResolvedValue(householdWith(undefined))
    const res = await PUT(putReq({ expenseType: "Fixed" }), ctx(ID))
    expect(res.status).toBe(404)
  })

  it("upserts the override (stamping the member) and returns it", async () => {
    const h = householdWith({ id: ID })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(putReq({ expenseType: "Fixed" }), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.upsert).toHaveBeenCalledWith({ transactionId: ID, expenseType: "Fixed", memberId: "mem1" })
    expect(h.record).toHaveBeenCalledWith({
      memberId: "mem1",
      actorName: "Ada",
      action: "transaction.retyped",
      payload: { transactionId: ID, merchant: undefined, expenseType: "Fixed" },
    })
    expect(await res.json()).toEqual({ id: "ov1", expenseType: "Fixed" })
  })

  it("accepts the empty (split) expense type", async () => {
    const h = householdWith({ id: ID })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(putReq({ expenseType: "" }), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.upsert).toHaveBeenCalledWith({ transactionId: ID, expenseType: "", memberId: "mem1" })
  })

  it("400s when neither axis is provided", async () => {
    const res = await PUT(putReq({}), ctx(ID))
    expect(res.status).toBe(400)
  })

  it("sets a Category override (visible leaf) and logs recategorized (ADR-0020)", async () => {
    const h = householdWith({ id: ID })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(putReq({ categoryId: CAT_ID }), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.upsert).toHaveBeenCalledWith({ transactionId: ID, categoryId: CAT_ID, memberId: "mem1" })
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "transaction.recategorized" }),
    )
  })

  it("sets both axes in one request and logs each (retyped + recategorized)", async () => {
    const h = householdWith({ id: ID })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(putReq({ expenseType: "Fixed", categoryId: CAT_ID }), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.upsert).toHaveBeenCalledWith({
      transactionId: ID,
      expenseType: "Fixed",
      categoryId: CAT_ID,
      memberId: "mem1",
    })
    const actions = h.record.mock.calls.map((c) => (c[0] as { action: string }).action)
    expect(actions).toContain("transaction.retyped")
    expect(actions).toContain("transaction.recategorized")
  })

  it("400s a malformed categoryId", async () => {
    const res = await PUT(putReq({ categoryId: "not-a-uuid" }), ctx(ID))
    expect(res.status).toBe(400)
  })

  it("400s a categoryId that isn't one of the household's visible leaves", async () => {
    const h = householdWith({ id: ID })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(putReq({ categoryId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }), ctx(ID))
    expect(res.status).toBe(400)
    expect(h.upsert).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/transactions/[id]/override", () => {
  it("400s a malformed id before resolving the household", async () => {
    const res = await DELETE(new Request("http://test/", { method: "DELETE" }), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("404s when the transaction is not in the household", async () => {
    requireHousehold.mockResolvedValue(householdWith(undefined))
    const res = await DELETE(new Request("http://test/", { method: "DELETE" }), ctx(ID))
    expect(res.status).toBe(404)
  })

  it("clears the override", async () => {
    const h = householdWith({ id: ID })
    requireHousehold.mockResolvedValue(h)
    const res = await DELETE(new Request("http://test/", { method: "DELETE" }), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.remove).toHaveBeenCalledWith(ID)
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "transaction.retype_cleared" }),
    )
    expect(await res.json()).toEqual({ cleared: true })
  })

  it("does not log when there was no override to clear (no-op)", async () => {
    const h = householdWith({ id: ID })
    h.remove.mockResolvedValue([])
    requireHousehold.mockResolvedValue(h)
    const res = await DELETE(new Request("http://test/", { method: "DELETE" }), ctx(ID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cleared: false })
    expect(h.record).not.toHaveBeenCalled()
  })
})
