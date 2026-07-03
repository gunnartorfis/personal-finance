import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
const updateMemberLocale = vi.fn()
const cookieSet = vi.fn()

vi.mock("@/lib/household/current", () => ({
  requireHousehold: () => requireHousehold(),
}))
vi.mock("@/lib/household/membership", () => ({
  updateMemberLocale: (...args: unknown[]) => updateMemberLocale(...args),
}))
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }))
vi.mock("next/headers", () => ({ cookies: async () => ({ set: cookieSet }) }))

import { PUT } from "./route"

const put = (body: unknown) =>
  PUT(new Request("http://test/", { method: "PUT", body: JSON.stringify(body) }))

beforeEach(() => {
  requireHousehold.mockReset()
  updateMemberLocale.mockReset()
  cookieSet.mockReset()
  requireHousehold.mockResolvedValue({ memberId: "m1" })
})

describe("PUT /api/settings/locale", () => {
  it("400s an unsupported locale before touching the household", async () => {
    const res = await put({ locale: "fr" })
    expect(res.status).toBe(400)
    expect(requireHousehold).not.toHaveBeenCalled()
    expect(updateMemberLocale).not.toHaveBeenCalled()
  })

  it("persists the member locale and sets the cookie", async () => {
    const res = await put({ locale: "en" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ locale: "en" })
    expect(updateMemberLocale).toHaveBeenCalledWith({}, "m1", "en")
    expect(cookieSet).toHaveBeenCalledWith(
      "NEXT_LOCALE",
      "en",
      expect.objectContaining({ path: "/", sameSite: "lax" })
    )
  })

  it("400s a missing body", async () => {
    const res = await PUT(new Request("http://test/", { method: "PUT" }))
    expect(res.status).toBe(400)
  })
})
