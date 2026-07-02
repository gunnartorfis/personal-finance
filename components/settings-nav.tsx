"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { isActivePath } from "@/lib/nav"
import { cn } from "@/lib/utils"

/** Every settings section, in nav order. App-owned sections plus the Neon Auth account/security views. */
const SETTINGS_NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/settings/income", label: "Income" },
  { href: "/settings/rules", label: "Rules" },
  { href: "/settings/household", label: "Household" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/account", label: "Account" },
  { href: "/settings/security", label: "Security" },
]

/**
 * The persistent left navigation for the Settings hub. Mirrors Neon Auth's account-view sidebar
 * (same ghost-button rows, `font-semibold` active / `text-foreground/70` idle) so every settings
 * route — app-owned or Neon Auth — shares one consistent shell. Rendered once by the settings layout.
 */
export function SettingsNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Settings"
      className="flex w-full shrink-0 flex-col gap-1 md:w-48 lg:w-60"
    >
      {SETTINGS_NAV.map((item) => {
        const active = isActivePath(pathname, item.href)
        return (
          <Button
            key={item.href}
            variant="ghost"
            size="lg"
            render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
            className={cn(
              "w-full justify-start px-4 transition-none",
              active ? "font-semibold" : "text-foreground/70",
            )}
          >
            {item.label}
          </Button>
        )
      })}
    </nav>
  )
}
