import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const usePathname = vi.fn()
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }))

import { MainNav } from "@/components/main-nav"

afterEach(() => usePathname.mockReset())

describe("MainNav", () => {
  it("renders the brand plus dashboard and billing links", () => {
    usePathname.mockReturnValue("/dashboard")
    render(<MainNav />)
    expect(screen.getByRole("link", { name: "Finance" })).toHaveAttribute("href", "/dashboard")
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard")
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute("href", "/billing")
  })

  it("marks the active route with aria-current", () => {
    usePathname.mockReturnValue("/billing")
    render(<MainNav />)
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current")
  })

  it("is hidden on the auth screens", () => {
    usePathname.mockReturnValue("/auth/sign-in")
    const { container } = render(<MainNav />)
    expect(container).toBeEmptyDOMElement()
  })
})
