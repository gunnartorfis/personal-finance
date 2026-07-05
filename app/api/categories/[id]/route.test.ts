import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { PATCH } from "./route"

const ID = "11111111-1111-1111-1111-111111111111"

function req(body: unknown) {
  return new Request(`http://test/api/categories/${ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

beforeEach(() => requireHousehold.mockReset())

describe("PATCH /api/categories/[id]", () => {
  it("hides a leaf and returns the updated row", async () => {
    const setHidden = vi.fn(async () => ({ ok: true, row: { id: ID, hidden: true } }))
    requireHousehold.mockResolvedValue({ repo: { categories: { setHidden } } })

    const res = await PATCH(req({ hidden: true }), { params: Promise.resolve({ id: ID }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: ID, hidden: true })
    expect(setHidden).toHaveBeenCalledWith(ID, true)
  })

  it("409s an attempt to hide a group", async () => {
    const setHidden = vi.fn(async () => ({ ok: false, error: "is_group" }))
    requireHousehold.mockResolvedValue({ repo: { categories: { setHidden } } })
    const res = await PATCH(req({ hidden: true }), { params: Promise.resolve({ id: ID }) })
    expect(res.status).toBe(409)
  })

  it("400s a non-boolean hidden", async () => {
    const setHidden = vi.fn()
    requireHousehold.mockResolvedValue({ repo: { categories: { setHidden } } })
    const res = await PATCH(req({ hidden: "yes" }), { params: Promise.resolve({ id: ID }) })
    expect(res.status).toBe(400)
    expect(setHidden).not.toHaveBeenCalled()
  })

  it("400s an invalid id", async () => {
    requireHousehold.mockResolvedValue({ repo: { categories: { setHidden: vi.fn() } } })
    const res = await PATCH(req({ hidden: true }), { params: Promise.resolve({ id: "nope" }) })
    expect(res.status).toBe(400)
  })

  it("404s when the category isn't in this Household", async () => {
    const setHidden = vi.fn(async () => ({ ok: false, error: "not_found" }))
    requireHousehold.mockResolvedValue({ repo: { categories: { setHidden } } })
    const res = await PATCH(req({ hidden: true }), { params: Promise.resolve({ id: ID }) })
    expect(res.status).toBe(404)
  })
})
