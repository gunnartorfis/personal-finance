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
import { useNavLabels } from "@/lib/nav-labels"
import { currentNavLabelKey } from "@/lib/nav"

/** Inset header content: the sidebar toggle and a breadcrumb for the current page. */
export function AppHeader() {
  const pathname = usePathname()
  const labels = useNavLabels()
  const key = currentNavLabelKey(pathname)

  return (
    <>
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-vertical:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {/* No nav match falls back to the brand, which is not translated. */}
            <BreadcrumbPage>{key ? labels[key] : "Finance"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </>
  )
}
