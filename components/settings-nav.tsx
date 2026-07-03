"use client"

import {
  CreditCard,
  Shield,
  SlidersHorizontal,
  UserCog,
  Users,
  Wallet,
} from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType, SVGProps } from "react"

import { isActivePath, type NavLabelKey } from "@/lib/nav"
import { cn } from "@/lib/utils"

/** Every settings section, in nav order. App-owned sections plus the Neon Auth account/security views. */
const SETTINGS_NAV: ReadonlyArray<{
  href: string
  labelKey: NavLabelKey
  icon: ComponentType<SVGProps<SVGSVGElement>>
}> = [
  { href: "/settings/income", labelKey: "income", icon: Wallet },
  { href: "/settings/rules", labelKey: "rules", icon: SlidersHorizontal },
  { href: "/settings/household", labelKey: "household", icon: Users },
  { href: "/settings/billing", labelKey: "billing", icon: CreditCard },
  { href: "/settings/account", labelKey: "account", icon: UserCog },
  { href: "/settings/security", labelKey: "security", icon: Shield },
]

/**
 * The persistent navigation for the Settings hub. A vertical sidebar on desktop; below `lg` it
 * becomes a horizontal, scrollable tab bar so the six sections stay reachable without pushing the
 * content down. Active state is conveyed with a muted background + full-contrast text/icon (never a
 * font-weight change), matching the app's other nav surfaces. Rendered once by the settings layout.
 */
export function SettingsNav() {
  const pathname = usePathname()
  const t = useTranslations("nav")
  // Resolve with literal keys (keeps next-intl static checking), then index by each item's labelKey.
  const labels: Record<NavLabelKey, string> = {
    dashboard: t("dashboard"),
    accounts: t("accounts"),
    transactions: t("transactions"),
    savings: t("savings"),
    settings: t("settings"),
    upload: t("upload"),
    rules: t("rules"),
    income: t("income"),
    household: t("household"),
    billing: t("billing"),
    account: t("account"),
    security: t("security"),
  }
  return (
    <nav
      aria-label={t("settings")}
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {SETTINGS_NAV.map((item) => {
        const active = isActivePath(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm lg:shrink",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <item.icon aria-hidden="true" className="size-4 shrink-0" />
            {labels[item.labelKey]}
          </Link>
        )
      })}
    </nav>
  )
}
