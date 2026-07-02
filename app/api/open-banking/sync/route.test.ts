import { beforeEach, describe, expect, it, vi } from "vitest"

import { requireHousehold } from "@/lib/household/current"
import { syncHousehold } from "@/lib/open-banking/cron-sync"

vi.mock("@/lib/household/current", () => ({ requireHousehold: vi.fn() }))
vi.mock("@/lib/open-banking/cron-sync", () => ({
  syncHousehold: vi.fn(),
  syncDueConnections: vi.fn(),
}))
vi.mock("@/lib/open-banking/provider-factory", () => ({ getIngestionProvider: vi.fn() }))
vi.mock("@/lib/classification/sonnet-classifier", () => ({ sonnetClassifier: vi.fn() }))
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))

import { POST } from "./route"

const mockPlan = (plan: "Free" | "Premium") =>
  vi.mocked(requireHousehold).mockResolvedValue({
    plan,
    householdId: "hh-1",
  } as Awaited<ReturnType<typeof requireHousehold>>)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/open-banking/sync (on-link initial sync)", () => {
  it("403s a Free household without touching the provider (bank sync is Premium-only)", async () => {
    mockPlan("Free")
    const res = await POST()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "upgrade_required" })
    expect(syncHousehold).not.toHaveBeenCalled()
  })

  it("syncs the caller's own household and returns the counts", async () => {
    mockPlan("Premium")
    vi.mocked(syncHousehold).mockResolvedValue({ inserted: 4, failed: 0 })

    const res = await POST()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ inserted: 4, failed: 0 })
    // Scoped to the session household — never a caller-supplied id.
    expect(syncHousehold).toHaveBeenCalledTimes(1)
    expect(vi.mocked(syncHousehold).mock.calls[0][0]).toMatchObject({
      householdId: "hh-1",
      plan: "Premium",
    })
  })
})
