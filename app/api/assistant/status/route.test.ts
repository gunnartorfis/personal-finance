import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { GET } from "./route"

beforeEach(() => {
  requireHousehold.mockReset()
})

describe("GET /api/assistant/status", () => {
  it("returns the household's plan", async () => {
    requireHousehold.mockResolvedValue({ plan: "Premium", repo: {}, memberId: "m1" })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ plan: "Premium" })
  })

  it("reports Free households too (so the client can gate)", async () => {
    requireHousehold.mockResolvedValue({ plan: "Free", repo: {}, memberId: "m1" })
    expect(await (await GET()).json()).toEqual({ plan: "Free" })
  })
})
