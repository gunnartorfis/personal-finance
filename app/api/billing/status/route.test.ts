import { describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))
// No-op so a generic (non-redirect) error falls through to the logged 500 deterministically.
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }))

import { GET } from "./route"

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

  it("500s a real failure instead of an unlogged crash", async () => {
    requireHousehold.mockImplementation(() => {
      throw new Error("db down")
    })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
