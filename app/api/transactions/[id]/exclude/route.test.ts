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
  result: { id: string; excluded: boolean; exclusionNote: string | null } = {
    id: ID,
    excluded: true,
    exclusionNote: null,
  }
) {
  const setExcluded = vi.fn().mockResolvedValue([result])
  const record = vi.fn().mockResolvedValue([])
  return {
    setExcluded,
    record,
    memberId: "member-1",
    user: { name: "Ada", email: "ada@x.is" },
    repo: {
      transactions: {
        findById: vi.fn().mockResolvedValue(transaction),
        setExcluded,
      },
      activity: { record },
    },
  }
}

beforeEach(() => requireHousehold.mockReset())

describe("PUT /api/transactions/[id]/exclude", () => {
  it("400s a malformed id before resolving the household", async () => {
    const res = await PUT(req("PUT"), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("404s when the transaction is not in the household", async () => {
    requireHousehold.mockResolvedValue(householdWith(undefined))
    const res = await PUT(req("PUT"), ctx(ID))
    expect(res.status).toBe(404)
  })

  it("404s when the row vanishes between the lookup and the update", async () => {
    const h = householdWith({ id: ID, amount: -500 })
    h.repo.transactions.setExcluded.mockResolvedValue([])
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT"), ctx(ID))
    expect(res.status).toBe(404)
  })

  it("excludes a debit with no note", async () => {
    const h = householdWith({ id: ID, amount: -500 })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT"), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.setExcluded).toHaveBeenCalledWith(ID, true, null)
    expect(await res.json()).toEqual({
      id: ID,
      excluded: true,
      exclusionNote: null,
    })
  })

  it("records a transaction.excluded activity entry attributed to the actor", async () => {
    const h = householdWith({ id: ID, amount: -500, merchant: "Netto" })
    requireHousehold.mockResolvedValue(h)
    await PUT(req("PUT"), ctx(ID))
    expect(h.record).toHaveBeenCalledWith({
      memberId: "member-1",
      actorName: "Ada",
      action: "transaction.excluded",
      payload: { transactionId: ID, merchant: "Netto", amount: -500, note: null },
    })
  })

  it("excludes a credit too — any sign qualifies", async () => {
    const h = householdWith({ id: ID, amount: 1000 })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT"), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.setExcluded).toHaveBeenCalledWith(ID, true, null)
  })

  it("passes a trimmed note through", async () => {
    const h = householdWith(
      { id: ID, amount: -500 },
      {
        id: ID,
        excluded: true,
        exclusionNote: "grandma's vacuum",
      }
    )
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT", { note: "  grandma's vacuum  " }), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.setExcluded).toHaveBeenCalledWith(ID, true, "grandma's vacuum")
    expect(await res.json()).toEqual({
      id: ID,
      excluded: true,
      exclusionNote: "grandma's vacuum",
    })
  })

  it("treats a blank note as none", async () => {
    const h = householdWith({ id: ID, amount: -500 })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT", { note: "   " }), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.setExcluded).toHaveBeenCalledWith(ID, true, null)
  })

  it("400s a non-string note without touching the row", async () => {
    const h = householdWith({ id: ID, amount: -500 })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT", { note: 42 }), ctx(ID))
    expect(res.status).toBe(400)
    expect(h.setExcluded).not.toHaveBeenCalled()
  })

  it("400s a note over the length cap", async () => {
    const h = householdWith({ id: ID, amount: -500 })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT", { note: "x".repeat(281) }), ctx(ID))
    expect(res.status).toBe(400)
    expect(h.setExcluded).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/transactions/[id]/exclude", () => {
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

  it("re-includes a transaction and clears the note", async () => {
    const h = householdWith(
      { id: ID, amount: -500 },
      {
        id: ID,
        excluded: false,
        exclusionNote: null,
      }
    )
    requireHousehold.mockResolvedValue(h)
    const res = await DELETE(req("DELETE"), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.setExcluded).toHaveBeenCalledWith(ID, false, null)
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "transaction.included" }),
    )
    expect(await res.json()).toEqual({
      id: ID,
      excluded: false,
      exclusionNote: null,
    })
  })

  it("does not log when re-including an already-included transaction (no-op)", async () => {
    const h = householdWith(
      { id: ID, amount: -500, excluded: false, exclusionNote: null },
      { id: ID, excluded: false, exclusionNote: null },
    )
    requireHousehold.mockResolvedValue(h)
    const res = await DELETE(req("DELETE"), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.record).not.toHaveBeenCalled()
  })
})
