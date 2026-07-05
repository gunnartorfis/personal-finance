import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { POST } from "./route"

const GROUP = "11111111-1111-1111-1111-111111111111"

function req(body: unknown) {
  return new Request("http://test/api/categories", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => requireHousehold.mockReset())

describe("POST /api/categories", () => {
  it("creates a custom leaf and returns 201 with the row", async () => {
    const createCustom = vi.fn(async () => ({ ok: true, row: { id: "c1", label: "Pool" } }))
    requireHousehold.mockResolvedValue({ repo: { categories: { createCustom } } })

    const res = await POST(req({ parentId: GROUP, label: "  Pool  ", defaultExpenseType: "Necessary" }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: "c1", label: "Pool" })
    // Label is trimmed before it reaches the repo.
    expect(createCustom).toHaveBeenCalledWith({
      parentId: GROUP,
      label: "Pool",
      defaultExpenseType: "Necessary",
      icon: null,
    })
  })

  it("400s a missing/blank label without touching the repo", async () => {
    const createCustom = vi.fn()
    requireHousehold.mockResolvedValue({ repo: { categories: { createCustom } } })
    const res = await POST(req({ parentId: GROUP, label: "   " }))
    expect(res.status).toBe(400)
    expect(createCustom).not.toHaveBeenCalled()
  })

  it("400s a non-real defaultExpenseType, but treats '' as no fallback (null)", async () => {
    const createCustom = vi.fn(async () => ({ ok: true, row: { id: "c1" } }))
    requireHousehold.mockResolvedValue({ repo: { categories: { createCustom } } })

    // A garbage bucket is rejected before the repo is touched.
    expect((await POST(req({ parentId: GROUP, label: "X", defaultExpenseType: "Splurge" }))).status).toBe(400)
    expect(createCustom).not.toHaveBeenCalled()

    // "" means "no fallback" → the repo receives null, not "".
    const res = await POST(req({ parentId: GROUP, label: "X", defaultExpenseType: "" }))
    expect(res.status).toBe(201)
    expect(createCustom).toHaveBeenCalledWith({
      parentId: GROUP,
      label: "X",
      defaultExpenseType: null,
      icon: null,
    })
  })

  it("maps parent_not_found → 404 and parent_not_group → 409", async () => {
    const createCustom = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "parent_not_found" })
      .mockResolvedValueOnce({ ok: false, error: "parent_not_group" })
    requireHousehold.mockResolvedValue({ repo: { categories: { createCustom } } })

    expect((await POST(req({ parentId: GROUP, label: "X" }))).status).toBe(404)
    expect((await POST(req({ parentId: GROUP, label: "X" }))).status).toBe(409)
  })
})
