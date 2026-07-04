import { AccountView } from "@neondatabase/auth-ui"
import { getTranslations } from "next-intl/server"

import { HouseholdReset } from "@/components/household-reset"
import { requireUser } from "@/lib/auth/session"
import { isHouseholdResetEnabled } from "@/lib/household/reset-availability"

// Auth-scoped, per-request session UI: always render dynamically (no static prerender).
export const dynamic = "force-dynamic"

/**
 * Account profile settings (ADR-0001), under the Settings hub at `/settings/account`: renders Neon
 * Auth's account view. The provider maps the SETTINGS view here (basePath `/settings`); nav comes
 * from the shared settings layout, so the view's own tabs are hidden (`hideNav`). `requireUser()`
 * enforces the signed-in guard and redirects to sign-in otherwise.
 *
 * When the household reset tool is enabled (`ENABLE_HOUSEHOLD_RESET`), a "Danger zone" for wiping
 * the household's transaction data is appended below the Neon Auth view.
 */
export default async function AccountSettingsPage() {
  await requireUser()
  const t = await getTranslations("dataExport")
  return (
    <div className="flex flex-col gap-6">
      <AccountView path="account" hideNav />
      <section className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("description")}</p>
        <a
          href="/api/export"
          download
          className="mt-1 inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          {t("download")}
        </a>
      </section>
      {isHouseholdResetEnabled() && <HouseholdReset />}
    </div>
  )
}
