import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { GET, POST } from "./route"

const postReq = (body: unknown) =>
  new Request("http://test/", { method: "POST", body: JSON.stringify(body) })

beforeEach(() => requireHousehold.mockReset())

describe("GET /api/accounts", () => {
  it("returns the household's accounts", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "a1", name: "Visa" }])
    requireHousehold.mockResolvedValue({ repo: { accounts: { list } } })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: "a1", name: "Visa" }])
  })
})

describe("POST /api/accounts", () => {
  it("400s a missing/blank name before resolving the household", async () => {
    expect((await POST(postReq({ name: "  " }))).status).toBe(400)
    expect((await POST(postReq({}))).status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("creates a trimmed account and returns 201", async () => {
    const create = vi.fn().mockResolvedValue([{ id: "a1", name: "Visa" }])
    requireHousehold.mockResolvedValue({ repo: { accounts: { create } } })

    const res = await POST(postReq({ name: "  Visa  " }))
    expect(res.status).toBe(201)
    expect(create).toHaveBeenCalledWith({ name: "Visa" })
    expect(await res.json()).toEqual({ id: "a1", name: "Visa" })
  })
})
