import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the session read (and, in turn, keep the real Neon Auth server chain — which pulls in
// `next/headers` — out of the jsdom test environment) and the navigation redirect.
const { getCurrentUser, redirect } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(),
}))
vi.mock("next/navigation", () => ({ redirect }))
vi.mock("@/lib/auth/session", () => ({ getCurrentUser }))

import Page from "@/app/page"

describe("Home page", () => {
  beforeEach(() => {
    redirect.mockReset()
    getCurrentUser.mockReset()
  })

  it("redirects signed-in members to the dashboard", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" })
    await Page()
    expect(redirect).toHaveBeenCalledWith("/dashboard")
  })

  it("renders the marketing page for signed-out visitors", async () => {
    getCurrentUser.mockResolvedValue(null)
    const result = await Page()
    expect(redirect).not.toHaveBeenCalled()
    expect(result).toBeTruthy()
  })
})
