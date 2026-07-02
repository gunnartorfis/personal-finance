import {
  ChevronRight,
  CreditCard,
  SlidersHorizontal,
  UserCog,
  Users,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import type { ComponentType, SVGProps } from "react"

import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

type SettingsLink = {
  href: string
  title: string
  description: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

/** The hub's sections. Account/security are Neon Auth views mounted under `/settings/*`. */
const SECTIONS: SettingsLink[] = [
  {
    href: "/settings/income",
    title: "Income & recurring costs",
    description: "Monthly income sources and fixed off-card costs.",
    icon: Wallet,
  },
  {
    href: "/settings/rules",
    title: "Merchant rules",
    description: "Deterministic merchant → type rules, applied before the AI.",
    icon: SlidersHorizontal,
  },
  {
    href: "/settings/household",
    title: "Household",
    description: "Members, invites, and shared financial picture.",
    icon: Users,
  },
  {
    href: "/settings/billing",
    title: "Billing",
    description: "Your plan and subscription.",
    icon: CreditCard,
  },
  {
    href: "/settings/account",
    title: "Account",
    description: "Your profile, security, and sign-in.",
    icon: UserCog,
  },
]

/** Settings hub: a single home for the household's configuration, one card per section. */
export default async function SettingsPage() {
  await requireHousehold() // gate on auth
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Manage your income, rules, household, plan, and account.
        </p>
      </header>
      <nav aria-label="Settings sections" className="flex flex-col gap-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
              <section.icon aria-hidden="true" className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{section.title}</span>
              <span className="text-sm text-pretty text-muted-foreground">
                {section.description}
              </span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className="ml-auto size-4 shrink-0 text-muted-foreground"
            />
          </Link>
        ))}
      </nav>
    </div>
  )
}
