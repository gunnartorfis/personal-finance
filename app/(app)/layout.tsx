import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { AssistantLauncher } from "@/components/assistant/assistant-launcher"
import { ClassificationBanner } from "@/components/classification-banner"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getCurrentUser } from "@/lib/auth/session"
import { getDb } from "@/lib/db"
import { findActiveInvitesByEmail } from "@/lib/household/invites"

/**
 * Shell for signed-in routes (ADR Phase H): a collapsible left sidebar + inset content area. Pages
 * stay responsible for their own auth/tenant guard (`requireHousehold`). The sidebar's open/closed
 * state is persisted in the `sidebar_state` cookie so the first paint matches the last choice.
 *
 * Invite intercept (ADR-0010): a signed-in user with a pending Invite is force-routed to `/join`
 * before any app page renders — including existing Members, who would otherwise never discover an
 * Invite (they skip the sign-in provisioning intercept). They must act on it (accept, switching out
 * of their current Household; or decline) before returning to the app. `/join` lives outside this
 * layout, so there's no redirect loop.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (user) {
    const invites = await findActiveInvitesByEmail(getDb(), user.email, new Date())
    if (invites.length > 0) redirect("/join")
  }

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <AppHeader />
          <div className="ml-auto">
            <AssistantLauncher />
          </div>
        </header>
        <ClassificationBanner />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
