"use client"

import { Languages } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { toLocale } from "@/lib/i18n/config"

/**
 * Language switcher for the app-shell sidebar footer (slice 3c, ADR-0013). Two
 * locales, so the control simply offers the *other* one; clicking it persists the
 * choice via `PUT /api/settings/locale` (writes `member.locale` + the cookie) and
 * refreshes so the new locale takes effect. Its own labels come from the catalog;
 * the language names are endonyms (shown in their own language) by design.
 */
export function LocaleSwitcher() {
  const t = useTranslations("localeSwitcher")
  const locale = toLocale(useLocale()) ?? "is"
  const target = locale === "is" ? "en" : "is"
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function switchLocale() {
    startTransition(async () => {
      const res = await fetch("/api/settings/locale", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: target }),
      })
      // Only re-render if the switch actually persisted; a failed request must not
      // trigger a misleading no-op refresh (the control stays on the old locale).
      if (res.ok) router.refresh()
    })
  }

  const targetName = t(`language.${target}`)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={switchLocale}
          disabled={pending}
          tooltip={t("switchTo", { language: targetName })}
        >
          <Languages />
          <span>{targetName}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
