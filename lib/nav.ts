import {
  ArrowLeftRight,
  CreditCard,
  LayoutDashboard,
  PiggyBank,
  SlidersHorizontal,
  Upload,
  Users,
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
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/household", label: "Household", icon: Users },
  { href: "/billing", label: "Billing", icon: CreditCard },
]

/** True when `pathname` is on `href` or one of its descendant routes. */
export function isActivePath(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false)
}
