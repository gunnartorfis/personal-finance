"use client"

import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { currentNavLabelKey, type NavLabelKey } from "@/lib/nav"

/** Inset header content: the sidebar toggle and a breadcrumb for the current page. */
export function AppHeader() {
  const pathname = usePathname()
  const t = useTranslations("nav")
  // Resolve with literal keys (keeps next-intl static checking), then index by the current key.
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
