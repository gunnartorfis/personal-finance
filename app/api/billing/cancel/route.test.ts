import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

const downgradeToFree = vi.fn()
vi.mock("@/lib/billing/dunning", () => ({ downgradeToFree: (...a: unknown[]) => downgradeToFree(...a) }))

vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))

import { POST } from "./route"

beforeEach(() => {
  requireHousehold.mockReset()
  downgradeToFree.mockReset()
})

describe("POST /api/billing/cancel", () => {
  it("downgrades a Premium household to Free", async () => {
    requireHousehold.mockResolvedValue({ householdId: "h1", plan: "Premium" })
    downgradeToFree.mockResolvedValue(undefined)

    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cancelled: true })
    expect(downgradeToFree).toHaveBeenCalledWith(expect.anything(), "h1")
  })

  it("is a no-op for a Free household", async () => {
    requireHousehold.mockResolvedValue({ householdId: "h1", plan: "Free" })

    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cancelled: false })
    expect(downgradeToFree).not.toHaveBeenCalled()
  })

  it("500s when the downgrade fails", async () => {
    requireHousehold.mockResolvedValue({ householdId: "h1", plan: "Premium" })
    downgradeToFree.mockRejectedValue(new Error("db down"))

    const res = await POST()
    expect(res.status).toBe(500)
  })
})
