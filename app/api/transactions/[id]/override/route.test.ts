import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { DELETE, PUT } from "./route"

const ID = "11111111-1111-1111-1111-111111111111"
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const putReq = (body: unknown) =>
  new Request("http://test/", { method: "PUT", body: JSON.stringify(body) })

function householdWith(transaction: unknown) {
  const upsert = vi.fn().mockResolvedValue([{ id: "ov1", expenseType: "Fixed" }])
  const remove = vi.fn().mockResolvedValue([{ id: "ov1" }])
  return {
    memberId: "mem1",
    upsert,
    remove,
    repo: {
      transactions: { findById: vi.fn().mockResolvedValue(transaction) },
      overrides: { upsert, remove },
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
    expect(await res.json()).toEqual({ id: "ov1", expenseType: "Fixed" })
  })

  it("accepts the empty (split) expense type", async () => {
    const h = householdWith({ id: ID })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(putReq({ expenseType: "" }), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.upsert).toHaveBeenCalledWith({ transactionId: ID, expenseType: "", memberId: "mem1" })
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
    expect(await res.json()).toEqual({ cleared: true })
  })
})
