import { screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const usePathname = vi.fn()
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }))

import { SettingsNav } from "@/components/settings-nav"
import { renderWithIntl as render } from "@/lib/test/render"

afterEach(() => usePathname.mockReset())

describe("SettingsNav", () => {
  it("renders a link for every settings section", () => {
    usePathname.mockReturnValue("/settings/account")
    render(<SettingsNav />)
    expect(screen.getByRole("link", { name: "Income & expenses" })).toHaveAttribute(
      "href",
      "/settings/income"
    )
    expect(screen.getByRole("link", { name: "Rules" })).toHaveAttribute(
      "href",
      "/settings/rules"
    )
    expect(screen.getByRole("link", { name: "Household" })).toHaveAttribute(
      "href",
      "/settings/household"
    )
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute(
      "href",
      "/settings/billing"
    )
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/settings/account"
    )
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute(
      "href",
      "/settings/security"
    )
  })

  it("marks the active section with aria-current", () => {
    usePathname.mockReturnValue("/settings/income")
    render(<SettingsNav />)
    expect(
      screen.getByRole("link", { name: "Income & expenses" })
    ).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Account" })).not.toHaveAttribute(
      "aria-current"
    )
  })

  it("treats descendant routes as active", () => {
    usePathname.mockReturnValue("/settings/security/two-factor")
    render(<SettingsNav />)
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute(
      "aria-current",
      "page"
    )
  })
})
