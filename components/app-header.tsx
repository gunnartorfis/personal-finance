"use client"

import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { isActivePath, NAV_ITEMS } from "@/lib/nav"

function currentLabel(pathname: string | null): string {
  return NAV_ITEMS.find((item) => isActivePath(pathname, item.href))?.label ?? "Finance"
}

/** Inset header content: the sidebar toggle and a breadcrumb for the current page. */
export function AppHeader() {
  const pathname = usePathname()

  return (
    <>
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-vertical:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{currentLabel(pathname)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </>
  )
}
