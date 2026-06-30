"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/accounts", label: "Accounts" },
  { href: "/billing", label: "Billing" },
]

/** App header brand + primary navigation. The whole cluster is hidden on the auth screens. */
export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname()
  if (pathname?.startsWith("/auth")) return null

  return (
    <nav className={cn("flex items-center gap-6", className)}>
      <Link href="/dashboard" className="font-semibold">
        Finance
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname?.startsWith(`${link.href}/`)
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-muted-foreground transition-colors hover:text-foreground",
                active && "font-medium text-foreground",
              )}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
