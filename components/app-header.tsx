"use client"

import { usePathname } from "next/navigation"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { isActivePath, NAV_ITEMS } from "@/lib/nav"

function currentLabel(pathname: string | null): string {
  return NAV_ITEMS.find((item) => isActivePath(pathname, item.href))?.label ?? "Finance"
}

/** Inset header content: the sidebar toggle and the current page title. */
export function AppHeader() {
  const pathname = usePathname()

  return (
    <>
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="text-sm font-medium">{currentLabel(pathname)}</h1>
    </>
  )
}
