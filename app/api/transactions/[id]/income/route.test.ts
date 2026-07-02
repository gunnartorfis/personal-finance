import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { DELETE, PUT } from "./route"

const ID = "11111111-1111-1111-1111-111111111111"
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (method: string) => new Request("http://test/", { method })

function householdWith(transaction: unknown, marked = true) {
  const setIncomeMarked = vi.fn().mockResolvedValue([{ id: ID, incomeMarked: marked }])
  return {
    setIncomeMarked,
    repo: {
      transactions: {
        findById: vi.fn().mockResolvedValue(transaction),
        setIncomeMarked,
      },
    },
  }
}

beforeEach(() => requireHousehold.mockReset())

describe("PUT /api/transactions/[id]/income", () => {
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

  it("409s a debit — only a credit can be income", async () => {
    const h = householdWith({ id: ID, amount: -500 })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT"), ctx(ID))
    expect(res.status).toBe(409)
    expect(h.setIncomeMarked).not.toHaveBeenCalled()
  })

  it("409s an excluded credit — income and excluded are mutually exclusive", async () => {
    const h = householdWith({ id: ID, amount: 1000, excluded: true })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT"), ctx(ID))
    expect(res.status).toBe(409)
    expect(h.setIncomeMarked).not.toHaveBeenCalled()
  })

  it("404s when the row vanishes between the lookup and the guarded update", async () => {
    const h = householdWith({ id: ID, amount: 1000 })
    h.repo.transactions.setIncomeMarked.mockResolvedValue([])
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT"), ctx(ID))
    expect(res.status).toBe(404)
  })

  it("marks a credit as income", async () => {
    const h = householdWith({ id: ID, amount: 1000 })
    requireHousehold.mockResolvedValue(h)
    const res = await PUT(req("PUT"), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.setIncomeMarked).toHaveBeenCalledWith(ID, true)
    expect(await res.json()).toEqual({ id: ID, incomeMarked: true })
  })
})

describe("DELETE /api/transactions/[id]/income", () => {
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

  it("unmarks a credit", async () => {
    const h = householdWith({ id: ID, amount: 1000 }, false)
    requireHousehold.mockResolvedValue(h)
    const res = await DELETE(req("DELETE"), ctx(ID))
    expect(res.status).toBe(200)
    expect(h.setIncomeMarked).toHaveBeenCalledWith(ID, false)
    expect(await res.json()).toEqual({ id: ID, incomeMarked: false })
  })
})
