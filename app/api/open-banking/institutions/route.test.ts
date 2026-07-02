import { beforeEach, describe, expect, it, vi } from "vitest"

import { requireHousehold } from "@/lib/household/current"
import { getIngestionProvider } from "@/lib/open-banking/provider-factory"

vi.mock("@/lib/household/current", () => ({ requireHousehold: vi.fn() }))
vi.mock("@/lib/open-banking/provider-factory", () => ({ getIngestionProvider: vi.fn() }))

import { GET } from "./route"

const get = (qs = "") =>
  GET(new Request(`http://test/api/open-banking/institutions${qs}`))

const listInstitutions = vi.fn()
const mockPlan = (plan: "Free" | "Premium") =>
  vi.mocked(requireHousehold).mockResolvedValue({ plan } as Awaited<ReturnType<typeof requireHousehold>>)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getIngestionProvider).mockReturnValue({ listInstitutions } as unknown as ReturnType<
    typeof getIngestionProvider
  >)
  listInstitutions.mockResolvedValue([{ name: "Landsbankinn", country: "IS" }])
})

describe("GET /api/open-banking/institutions", () => {
  it("403s a Free household (bank sync is Premium-only)", async () => {
    mockPlan("Free")
    const res = await get()
    expect(res.status).toBe(403)
    expect(listInstitutions).not.toHaveBeenCalled()
  })

  it("returns the Icelandic banks for a Premium household by default", async () => {
    mockPlan("Premium")
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ name: "Landsbankinn", country: "IS" }])
    expect(listInstitutions).toHaveBeenCalledWith("IS")
  })

  it("honors an explicit country query", async () => {
    mockPlan("Premium")
    await get("?country=GB")
    expect(listInstitutions).toHaveBeenCalledWith("GB")
  })

  it("502s when the provider fails", async () => {
    mockPlan("Premium")
    listInstitutions.mockRejectedValue(new Error("aggregator down"))
    expect((await get()).status).toBe(502)
  })
})
