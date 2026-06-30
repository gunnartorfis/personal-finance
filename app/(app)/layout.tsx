import { cookies } from "next/headers"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

/**
 * Shell for signed-in routes (ADR Phase H): a collapsible left sidebar + inset content area. Pages
 * stay responsible for their own auth/tenant guard (`requireHousehold`). The sidebar's open/closed
 * state is persisted in the `sidebar_state` cookie so the first paint matches the last choice.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <AppHeader />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
