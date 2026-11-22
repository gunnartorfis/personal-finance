import { getTranslations } from "next-intl/server"

import { DigestPreferenceToggle } from "@/components/digest-preference-toggle"
import { HouseholdReset } from "@/components/household-reset"
import { AccountProfileSettings } from "@/components/settings/account-profile-settings"
import { getDb } from "@/lib/db"
import { isDigestSubscribed } from "@/lib/digest/subscription"
import { requireHousehold } from "@/lib/household/current"
import { isHouseholdResetEnabled } from "@/lib/household/reset-availability"

// Auth-scoped, per-request session UI: always render dynamically (no static prerender).
export const dynamic = "force-dynamic"

export default async function AccountSettingsPage() {
  const [{ memberId }, t, nav, account] = await Promise.all([
    requireHousehold(),
    getTranslations("dataExport"),
    getTranslations("nav"),
    getTranslations("accountSettings"),
  ])
  const digestSubscribed = await isDigestSubscribed(getDb(), memberId)
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {nav("account")}
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {account("description")}
        </p>
      </header>
      <AccountProfileSettings />
      <DigestPreferenceToggle subscribed={digestSubscribed} />
      <section className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">
          {t("description")}
        </p>
        {/* react-doctor-disable-next-line react-doctor/nextjs-no-a-element -- file download from an API route, not a page nav; next/link would prefetch and trigger the export */}
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
