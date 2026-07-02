import { beforeEach, describe, expect, it, vi } from "vitest"

import { requireHousehold } from "@/lib/household/current"
import { getIngestionProvider } from "@/lib/open-banking/provider-factory"

vi.mock("@/lib/household/current", () => ({ requireHousehold: vi.fn() }))
vi.mock("@/lib/open-banking/provider-factory", () => ({ getIngestionProvider: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }) }))

import { POST } from "./route"

const post = (body: unknown) =>
  new Request("http://test/api/open-banking/connect", { method: "POST", body: JSON.stringify(body) })

const validBody = { institutionName: "Landsbankinn", country: "IS" }

const mockPlan = (plan: "Free" | "Premium") =>
  vi.mocked(requireHousehold).mockResolvedValue({ plan } as Awaited<ReturnType<typeof requireHousehold>>)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getIngestionProvider).mockReturnValue({
    startAuth: async () => ({ url: "https://bank/redirect", authorizationId: "auth-1" }),
  } as unknown as ReturnType<typeof getIngestionProvider>)
})

describe("POST /api/open-banking/connect", () => {
  it("400s when institution fields are missing", async () => {
    mockPlan("Premium")
    expect((await POST(post({}))).status).toBe(400)
    expect((await POST(post({ institutionName: "Landsbankinn" }))).status).toBe(400)
    expect((await POST(post({ country: "IS" }))).status).toBe(400)
  })

  it("403s a Free household with upgrade_required (bank sync is Premium-only)", async () => {
    mockPlan("Free")
    const res = await POST(post(validBody))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "upgrade_required" })
  })

  it("starts the consent flow for a Premium household", async () => {
    mockPlan("Premium")
    const res = await POST(post(validBody))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: "https://bank/redirect" })
  })
})
