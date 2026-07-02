import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/household/current", () => ({ requireHousehold: vi.fn() }))
vi.mock("@/lib/open-banking/provider-factory", () => ({ getIngestionProvider: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }) }))

import { POST } from "./route"

const post = (body: unknown) =>
  new Request("http://test/api/open-banking/connect", { method: "POST", body: JSON.stringify(body) })

describe("POST /api/open-banking/connect", () => {
  it("400s when institution fields are missing", async () => {
    expect((await POST(post({}))).status).toBe(400)
    expect((await POST(post({ institutionName: "Landsbankinn" }))).status).toBe(400)
    expect((await POST(post({ country: "IS" }))).status).toBe(400)
  })
})
