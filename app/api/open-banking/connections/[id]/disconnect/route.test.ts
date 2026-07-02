import { beforeEach, describe, expect, it, vi } from "vitest"

import { requireHousehold } from "@/lib/household/current"
import { getIngestionProvider } from "@/lib/open-banking/provider-factory"

vi.mock("@/lib/household/current", () => ({ requireHousehold: vi.fn() }))
vi.mock("@/lib/open-banking/provider-factory", () => ({ getIngestionProvider: vi.fn() }))

import { POST } from "./route"

const VALID = "11111111-1111-1111-1111-111111111111"
const post = (id: string) =>
  POST(new Request("http://test/api/open-banking/connections/x/disconnect", { method: "POST" }), {
    params: Promise.resolve({ id }),
  })

const repo = {
  bankConnections: {
    findById: vi.fn(),
    update: vi.fn(),
  },
}

const deleteSession = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireHousehold).mockResolvedValue({ repo } as unknown as Awaited<
    ReturnType<typeof requireHousehold>
  >)
  deleteSession.mockResolvedValue(undefined)
  vi.mocked(getIngestionProvider).mockReturnValue({ deleteSession } as unknown as ReturnType<
    typeof getIngestionProvider
  >)
})

describe("POST /api/open-banking/connections/[id]/disconnect", () => {
  it("400s an invalid connection id without touching the repo", async () => {
    const res = await post("not-a-uuid")
    expect(res.status).toBe(400)
    expect(repo.bankConnections.findById).not.toHaveBeenCalled()
  })

  it("404s another tenant's / unknown connection id", async () => {
    repo.bankConnections.findById.mockResolvedValue(undefined)
    const res = await post(VALID)
    expect(res.status).toBe(404)
    expect(repo.bankConnections.update).not.toHaveBeenCalled()
  })

  it("404s (not 500) if the update races to an empty result", async () => {
    repo.bankConnections.findById.mockResolvedValue({ id: VALID, status: "active" })
    repo.bankConnections.update.mockResolvedValue([])
    const res = await post(VALID)
    expect(res.status).toBe(404)
  })

  it("revokes locally and withdraws consent at the aggregator", async () => {
    repo.bankConnections.findById.mockResolvedValue({
      id: VALID,
      status: "active",
      providerConnectionId: "sess-42",
    })
    repo.bankConnections.update.mockResolvedValue([{ id: VALID, status: "revoked" }])

    const res = await post(VALID)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: VALID, status: "revoked" })
    expect(repo.bankConnections.update).toHaveBeenCalledWith(VALID, { status: "revoked" })
    expect(deleteSession).toHaveBeenCalledWith("sess-42")
  })

  it("still succeeds when the aggregator revoke fails (best-effort)", async () => {
    repo.bankConnections.findById.mockResolvedValue({
      id: VALID,
      status: "active",
      providerConnectionId: "sess-42",
    })
    repo.bankConnections.update.mockResolvedValue([{ id: VALID, status: "revoked" }])
    deleteSession.mockRejectedValue(new Error("aggregator down"))

    const res = await post(VALID)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: VALID, status: "revoked" })
  })

  it("still succeeds when the provider is unconfigured (getIngestionProvider throws)", async () => {
    repo.bankConnections.findById.mockResolvedValue({
      id: VALID,
      status: "active",
      providerConnectionId: "sess-42",
    })
    repo.bankConnections.update.mockResolvedValue([{ id: VALID, status: "revoked" }])
    // No env creds → getIngestionProvider throws; the disconnect must still complete locally.
    vi.mocked(getIngestionProvider).mockImplementation(() => {
      throw new Error("Enable Banking is not configured")
    })

    const res = await post(VALID)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: VALID, status: "revoked" })
    expect(deleteSession).not.toHaveBeenCalled()
  })
})
