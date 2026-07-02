import {
  ArrowLeftRight,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Wallet,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"

export type NavItem = {
  href: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

/** Primary navigation for signed-in users — shared by the app sidebar and the inset header. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/settings", label: "Settings", icon: Settings },
]

/**
 * Breadcrumb labels for signed-in routes that aren't primary nav items (Upload lives on the
 * Transactions page now; the Settings children are hub sub-pages). Longest-prefix match wins so a
 * child like `/settings/rules` beats the `/settings` hub label. Falls back through {@link NAV_ITEMS}.
 */
const SECONDARY_LABELS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/upload", label: "Upload" },
  { href: "/settings/rules", label: "Rules" },
  { href: "/settings/income", label: "Income" },
  { href: "/settings/household", label: "Household" },
  { href: "/settings/billing", label: "Billing" },
  // The Settings hub links out to the Neon Auth account view, which still renders under the app
  // layout's breadcrumb — without this it would fall through to the "Finance" fallback.
  { href: "/account", label: "Account" },
]

/** The breadcrumb label for `pathname`, preferring the most specific matching route. */
export function currentNavLabel(pathname: string | null): string {
  const secondary = SECONDARY_LABELS.filter((item) => isActivePath(pathname, item.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0]
  if (secondary) return secondary.label
  return NAV_ITEMS.find((item) => isActivePath(pathname, item.href))?.label ?? "Finance"
}

/** True when `pathname` is on `href` or one of its descendant routes. */
export function isActivePath(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false)
}
