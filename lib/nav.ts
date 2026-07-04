import {
  ArrowLeftRight,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Wallet,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"

/** Key into the `nav` message catalog. Kept as data here (labels are resolved in the components). */
export type NavLabelKey =
  | "dashboard"
  | "accounts"
  | "transactions"
  | "savings"
  | "settings"
  | "upload"
  | "rules"
  | "income"
  | "budgets"
  | "household"
  | "billing"
  | "account"
  | "security"

export type NavItem = {
  href: string
  labelKey: NavLabelKey
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

/** Primary navigation for signed-in users — shared by the app sidebar and the inset header. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/accounts", labelKey: "accounts", icon: Wallet },
  { href: "/transactions", labelKey: "transactions", icon: ArrowLeftRight },
  { href: "/savings", labelKey: "savings", icon: PiggyBank },
  { href: "/settings", labelKey: "settings", icon: Settings },
]

/**
 * Breadcrumb labels for signed-in routes that aren't primary nav items (Upload lives on the
 * Transactions page now; the Settings children are hub sub-pages). Longest-prefix match wins so a
 * child like `/settings/rules` beats the `/settings` hub label. Falls back through {@link NAV_ITEMS}.
 */
const SECONDARY_LABELS: ReadonlyArray<{ href: string; labelKey: NavLabelKey }> =
  [
    { href: "/upload", labelKey: "upload" },
    { href: "/settings/rules", labelKey: "rules" },
    { href: "/settings/income", labelKey: "income" },
    { href: "/settings/household", labelKey: "household" },
    { href: "/settings/billing", labelKey: "billing" },
    // The Neon Auth account/security views render under the Settings hub; label their breadcrumbs so
    // they don't fall through to the brand fallback.
    { href: "/settings/account", labelKey: "account" },
    { href: "/settings/security", labelKey: "security" },
  ]

/**
 * The `nav` catalog key for `pathname`'s breadcrumb, preferring the most specific matching route,
 * or `null` when nothing matches (the caller falls back to the brand). Label resolution happens in
 * the component so this stays a pure, translation-free helper.
 */
export function currentNavLabelKey(
  pathname: string | null
): NavLabelKey | null {
  const secondary = SECONDARY_LABELS.filter((item) =>
    isActivePath(pathname, item.href)
  ).sort((a, b) => b.href.length - a.href.length)[0]
  if (secondary) return secondary.labelKey
  return (
    NAV_ITEMS.find((item) => isActivePath(pathname, item.href))?.labelKey ??
    null
  )
}

/** True when `pathname` is on `href` or one of its descendant routes. */
export function isActivePath(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false)
}
