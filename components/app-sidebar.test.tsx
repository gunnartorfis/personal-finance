import { render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const usePathname = vi.fn()
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }))
// UserButton needs the Neon Auth provider; stub it so the sidebar renders standalone.
vi.mock("@neondatabase/auth-ui", () => ({
  UserButton: () => <div data-testid="user-button" />,
}))

import { SidebarProvider } from "@/components/ui/sidebar"

import { AppSidebar } from "@/components/app-sidebar"

beforeAll(() => {
  // jsdom has no matchMedia; useIsMobile (via SidebarProvider) calls it.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

afterEach(() => usePathname.mockReset())

function renderSidebar() {
  return render(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
  )
}

describe("AppSidebar", () => {
  it("renders the brand plus every primary nav link", () => {
    usePathname.mockReturnValue("/dashboard")
    renderSidebar()
    expect(screen.getByRole("link", { name: "Finance" })).toHaveAttribute("href", "/dashboard")
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard")
    expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute("href", "/accounts")
    expect(screen.getByRole("link", { name: "Upload" })).toHaveAttribute("href", "/upload")
    expect(screen.getByRole("link", { name: "Transactions" })).toHaveAttribute(
      "href",
      "/transactions",
    )
    expect(screen.getByRole("link", { name: "Rules" })).toHaveAttribute("href", "/rules")
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute("href", "/billing")
  })

  it("marks the active route with aria-current", () => {
    usePathname.mockReturnValue("/billing")
    renderSidebar()
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current")
  })

  it("treats descendant routes as active", () => {
    usePathname.mockReturnValue("/transactions/123")
    renderSidebar()
    expect(screen.getByRole("link", { name: "Transactions" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })
})
