import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { GET, POST } from "./route"

const postReq = (body: unknown) =>
  new Request("http://test/", { method: "POST", body: JSON.stringify(body) })

beforeEach(() => requireHousehold.mockReset())

describe("GET /api/merchant-rules", () => {
  it("returns the household's rules", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "r1", merchant: "NETFLIX", flatType: "Fixed" }])
    requireHousehold.mockResolvedValue({ repo: { merchantRules: { list } } })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: "r1", merchant: "NETFLIX", flatType: "Fixed" }])
  })
})

describe("POST /api/merchant-rules", () => {
  it("400s an invalid body before resolving the household", async () => {
    const res = await POST(postReq({ merchant: "X", flatType: "Splurge" }))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("creates a flat rule (normalized) and returns 201", async () => {
    const create = vi.fn().mockResolvedValue([{ id: "r1", merchant: "NETFLIX", flatType: "Fixed" }])
    requireHousehold.mockResolvedValue({ repo: { merchantRules: { create } } })

    const res = await POST(postReq({ merchant: "  netflix ", flatType: "Fixed" }))
    expect(res.status).toBe(201)
    expect(create).toHaveBeenCalledWith({ merchant: "NETFLIX", flatType: "Fixed" })
  })

  it("409s a duplicate merchant", async () => {
    const create = vi.fn().mockRejectedValue({ code: "23505" })
    requireHousehold.mockResolvedValue({ repo: { merchantRules: { create } } })

    const res = await POST(postReq({ merchant: "NETFLIX", flatType: "Fixed" }))
    expect(res.status).toBe(409)
  })
})
