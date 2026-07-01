"use client"

import { UserButton } from "@neondatabase/auth-ui"
import { PiggyBank } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { isActivePath, NAV_ITEMS } from "@/lib/nav"

/**
 * Left app sidebar for signed-in users (ADR Phase H): brand, primary navigation that collapses to
 * an icon rail, and the Neon Auth user menu in the footer. Wrapped in its own `TooltipProvider`
 * so the icon-mode menu tooltips work without touching the root layout.
 */
export function AppSidebar() {
  const pathname = usePathname()

  return (
    <TooltipProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
                <PiggyBank />
                <span className="font-semibold">Finance</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(pathname, item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      render={
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                        />
                      }
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          {/* Account menu is an identity control, not a primary action — render the trigger as a
              neutral, full-width row matching the sidebar's menu items instead of the auth-ui
              default (a solid `bg-primary` button). */}
          <UserButton
            size="default"
            className="w-full justify-start bg-transparent text-sidebar-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          />
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  )
}
