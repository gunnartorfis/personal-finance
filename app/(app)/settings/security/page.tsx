import { getTranslations } from "next-intl/server"

import { AccountSecuritySettings } from "@/components/settings/account-security-settings"
import { requireUser } from "@/lib/auth/session"

// Auth-scoped, per-request session UI: always render dynamically (no static prerender).
export const dynamic = "force-dynamic"

export default async function SecuritySettingsPage() {
  const [, nav, t] = await Promise.all([
    requireUser(),
    getTranslations("nav"),
    getTranslations("securitySettings"),
  ])
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {nav("security")}
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {t("description")}
        </p>
      </header>
      <AccountSecuritySettings />
    </div>
  )
}
