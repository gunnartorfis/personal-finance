"use client"

import { useClerk, useUser } from "@clerk/nextjs"
import { LogOut, Shield, UserRound } from "lucide-react"
import { useTranslations } from "next-intl"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function SidebarAccountMenu() {
  const t = useTranslations("auth")
  const nav = useTranslations("nav")
  const { user } = useUser()
  const clerk = useClerk()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!user) return null
  const name =
    user.fullName ?? user.primaryEmailAddress?.emailAddress ?? nav("account")

  async function signOut() {
    if (pending) return
    setPending(true)
    setFailed(false)
    try {
      await clerk.signOut({ redirectUrl: "/" })
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger
            aria-label={t("accountMenu")}
            render={<SidebarMenuButton tooltip={t("accountMenu")} />}
          >
            {user.hasImage ? (
              <Image
                src={user.imageUrl}
                alt=""
                width={16}
                height={16}
                unoptimized
                className="size-4 shrink-0 rounded-full object-cover"
              />
            ) : (
              <UserRound aria-hidden="true" />
            )}
            <span>{name}</span>
          </MenuTrigger>
          <MenuContent side="top">
            <MenuItem
              render={<Link href="/settings/account" />}
              nativeButton={false}
            >
              <UserRound aria-hidden="true" />
              {nav("account")}
            </MenuItem>
            <MenuItem
              render={<Link href="/settings/security" />}
              nativeButton={false}
            >
              <Shield aria-hidden="true" />
              {nav("security")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem disabled={pending} onClick={signOut}>
              <LogOut aria-hidden="true" />
              {pending ? t("working") : t("signOut")}
            </MenuItem>
          </MenuContent>
        </Menu>
        {failed && (
          <p role="alert" className="px-2 text-xs text-destructive">
            {t("signOutError")}
          </p>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
