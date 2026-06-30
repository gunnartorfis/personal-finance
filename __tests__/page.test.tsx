import { describe, expect, it, vi } from "vitest"

const redirect = vi.fn()
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => redirect(...args) }))

import Page from "@/app/page"

describe("Home page", () => {
  it("redirects to the dashboard", () => {
    Page()
    expect(redirect).toHaveBeenCalledWith("/dashboard")
  })
})
