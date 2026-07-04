import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { GET, PUT } from "./route"

const putReq = (body: unknown) =>
  new Request("http://test/", { method: "PUT", body: JSON.stringify(body) })

beforeEach(() => requireHousehold.mockReset())

describe("GET /api/budgets", () => {
  it("returns the household's budgets", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "b1", expenseType: "Fixed", monthlyAmount: 100_000 }])
    requireHousehold.mockResolvedValue({ repo: { budgets: { list } } })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      budgets: [{ id: "b1", expenseType: "Fixed", monthlyAmount: 100_000 }],
    })
  })
})

describe("PUT /api/budgets", () => {
  it("400s an invalid body before resolving the household", async () => {
    const res = await PUT(putReq({ budgets: [{ expenseType: "Splurge", monthlyAmount: 1 }] }))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("replaces the budgets, logs budgets.updated, and returns them", async () => {
    const saved = [
      { id: "b1", expenseType: "Fixed", monthlyAmount: 100_000 },
      { id: "b2", expenseType: "Necessary", monthlyAmount: 50_000 },
    ]
    const replace = vi.fn().mockResolvedValue(saved)
    const record = vi.fn().mockResolvedValue([])
    requireHousehold.mockResolvedValue({
      repo: { budgets: { replace }, activity: { record } },
      memberId: "m1",
      user: { name: "Ada", email: "ada@x.is" },
    })

    const res = await PUT(
      putReq({
        budgets: [
          { expenseType: "Fixed", monthlyAmount: 100_000 },
          { expenseType: "Necessary", monthlyAmount: 50_000 },
        ],
      }),
    )
    expect(res.status).toBe(200)
    expect(replace).toHaveBeenCalledWith([
      { expenseType: "Fixed", monthlyAmount: 100_000 },
      { expenseType: "Necessary", monthlyAmount: 50_000 },
    ])
    expect(record).toHaveBeenCalledWith({
      memberId: "m1",
      actorName: "Ada",
      action: "budgets.updated",
      payload: { count: 2 },
    })
    expect(await res.json()).toEqual({ budgets: saved })
  })
})
