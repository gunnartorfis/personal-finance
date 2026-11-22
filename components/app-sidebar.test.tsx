import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import en from "@/messages/en.json"

const usePathname = vi.fn()
const signOut = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
  useRouter: () => ({ refresh: () => {} }),
}))
// Supply the account identity without a live Clerk session.
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { fullName: "Test Member" } }),
  useClerk: () => ({ signOut }),
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
    <NextIntlClientProvider locale="en" messages={en}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </NextIntlClientProvider>,
  )
}

describe("AppSidebar", () => {
  it("opens app-owned account and security links and signs out through Clerk", async () => {
    usePathname.mockReturnValue("/dashboard")
    const user = userEvent.setup()
    renderSidebar()

    screen.getByRole("button", { name: "Account menu" }).focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("menuitem", { name: "Account" })).toHaveAttribute(
      "href",
      "/settings/account",
    )
    expect(screen.getByRole("menuitem", { name: "Security" })).toHaveAttribute(
      "href",
      "/settings/security",
    )
    screen.getByRole("menuitem", { name: "Sign out" }).focus()
    await user.keyboard("{Enter}")
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/" })
  })

  it("renders the brand plus every primary nav link", () => {
    usePathname.mockReturnValue("/dashboard")
    renderSidebar()
    expect(screen.getByRole("link", { name: "Finance" })).toHaveAttribute("href", "/dashboard")
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard")
    expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute("href", "/accounts")
    expect(screen.getByRole("link", { name: "Transactions" })).toHaveAttribute(
      "href",
      "/transactions",
    )
    expect(screen.getByRole("link", { name: "Savings" })).toHaveAttribute("href", "/savings")
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings")
  })

  it("marks the active route with aria-current", () => {
    usePathname.mockReturnValue("/settings")
    renderSidebar()
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page")
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
