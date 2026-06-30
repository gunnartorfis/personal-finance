import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the tenant guard so the handler can be exercised without a session.
const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { GET } from "./route"

const ID = "11111111-1111-1111-1111-111111111111"
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

type Counts = { total: number; pending: number; classified: number; failed: number }
function repoWith(upload: unknown, counts: Counts | null) {
  return {
    uploads: { findById: vi.fn().mockResolvedValue(upload) },
    transactions: { progress: vi.fn().mockResolvedValue(counts) },
  }
}

beforeEach(() => requireHousehold.mockReset())

describe("GET /api/uploads/[id]/progress", () => {
  it("400s a malformed upload id without touching the household", async () => {
    const res = await GET(new Request("http://t"), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
  })

  it("404s an unknown or other-tenant upload", async () => {
    requireHousehold.mockResolvedValue({ repo: repoWith(undefined, null) })
    const res = await GET(new Request("http://t"), ctx(ID))
    expect(res.status).toBe(404)
  })

  it("returns the counts with done=false while rows remain pending", async () => {
    requireHousehold.mockResolvedValue({
      repo: repoWith({ id: ID }, { total: 4, pending: 2, classified: 1, failed: 1 }),
    })
    const res = await GET(new Request("http://t"), ctx(ID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ total: 4, pending: 2, classified: 1, failed: 1, done: false })
  })

  it("reports done once every row is settled", async () => {
    requireHousehold.mockResolvedValue({
      repo: repoWith({ id: ID }, { total: 3, pending: 0, classified: 3, failed: 0 }),
    })
    const res = await GET(new Request("http://t"), ctx(ID))
    expect((await res.json()).done).toBe(true)
  })

  it("does not report done for an upload whose rows are not visible yet (total 0)", async () => {
    requireHousehold.mockResolvedValue({
      repo: repoWith({ id: ID }, { total: 0, pending: 0, classified: 0, failed: 0 }),
    })
    const res = await GET(new Request("http://t"), ctx(ID))
    expect((await res.json()).done).toBe(false)
  })
})
