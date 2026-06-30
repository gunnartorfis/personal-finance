import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

const createSession = vi.fn()
vi.mock("@/lib/payments/straumur", () => ({ createSession: (...a: unknown[]) => createSession(...a) }))

import { POST } from "./route"

const postReq = (body: unknown) =>
  new Request("https://app.example.com/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify(body),
  })

beforeEach(() => {
  requireHousehold.mockReset()
  createSession.mockReset()
})

describe("POST /api/billing/checkout", () => {
  it("400s an invalid period before resolving the household", async () => {
    const res = await POST(postReq({ period: "weekly" }))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("creates a tokenizing session for the monthly price and returns it", async () => {
    requireHousehold.mockResolvedValue({ householdId: "h1", billingCurrency: "ISK" })
    createSession.mockResolvedValue({ id: "CSBB_1", sessionData: "blob", clientKey: "k", checkoutReference: "c" })

    const res = await POST(postReq({ period: "monthly" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "CSBB_1", sessionData: "blob", clientKey: "k", checkoutReference: "c" })

    const arg = createSession.mock.calls[0][0]
    expect(arg).toMatchObject({
      amount: 1990,
      currency: "ISK",
      recurringProcessingModel: "Subscription",
      merchantShopperReference: "h1",
    })
    expect(arg.reference).toMatch(/^sub_h1_monthly_/)
    expect(arg.returnUrl).toBe("https://app.example.com/dashboard")
  })

  it("uses the discounted annual price", async () => {
    requireHousehold.mockResolvedValue({ householdId: "h1", billingCurrency: "ISK" })
    createSession.mockResolvedValue({ id: "s", sessionData: "d", clientKey: "k", checkoutReference: "c" })

    await POST(postReq({ period: "annual" }))
    expect(createSession.mock.calls[0][0].amount).toBe(16716)
  })

  it("502s when the gateway call fails", async () => {
    requireHousehold.mockResolvedValue({ householdId: "h1", billingCurrency: "ISK" })
    createSession.mockRejectedValue(new Error("gateway down"))

    const res = await POST(postReq({ period: "monthly" }))
    expect(res.status).toBe(502)
  })
})
