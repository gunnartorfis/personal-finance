"use client"

import { Monitor, Moon, Palette, Sun } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"

import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

const THEMES = [
  { value: "system", icon: Monitor },
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
] as const

export function SidebarThemeMenu() {
  const t = useTranslations("theme")
  const { theme, setTheme } = useTheme()
  const label = t("appearance")

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger render={<SidebarMenuButton tooltip={label} />}>
            <Palette />
            <span>{label}</span>
          </MenuTrigger>
          <MenuContent side="top">
            <MenuRadioGroup value={theme ?? "system"} onValueChange={setTheme} aria-label={label}>
              {THEMES.map(({ value, icon: Icon }) => (
                <MenuRadioItem key={value} value={value} closeOnClick>
                  <Icon />
                  {t(value)}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
