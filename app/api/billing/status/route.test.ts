import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { GET } from "./route"

beforeEach(() => requireHousehold.mockReset())

describe("GET /api/billing/status", () => {
  it("returns the current household's plan", async () => {
    requireHousehold.mockResolvedValue({ plan: "Premium" })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ plan: "Premium" })
  })

  it("reports Free before activation", async () => {
    requireHousehold.mockResolvedValue({ plan: "Free" })
    expect(await (await GET()).json()).toEqual({ plan: "Free" })
  })
})
