import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { GET } from "./route"

beforeEach(() => {
  requireHousehold.mockReset()
})

describe("GET /api/assistant/conversations", () => {
  it("lists the household's threads, trimmed to id/title/updatedAt", async () => {
    const listConversations = vi.fn().mockResolvedValue([
      { id: "c1", title: "March", updatedAt: new Date("2026-03-15T00:00:00Z"), startedByMemberId: "m1", householdId: "h" },
    ])
    requireHousehold.mockResolvedValue({ repo: { assistant: { listConversations } } })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      conversations: [{ id: "c1", title: "March", updatedAt: "2026-03-15T00:00:00.000Z" }],
    })
  })
})
