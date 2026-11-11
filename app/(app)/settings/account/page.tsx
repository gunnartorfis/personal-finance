import { UserProfile } from "@clerk/nextjs"
import { getTranslations } from "next-intl/server"

import { DigestPreferenceToggle } from "@/components/digest-preference-toggle"
import { HouseholdReset } from "@/components/household-reset"
import { getDb } from "@/lib/db"
import { isDigestSubscribed } from "@/lib/digest/subscription"
import { requireHousehold } from "@/lib/household/current"
import { isHouseholdResetEnabled } from "@/lib/household/reset-availability"

// Auth-scoped, per-request session UI: always render dynamically (no static prerender).
export const dynamic = "force-dynamic"

/** Clerk profile and security controls retain the application settings routes. */
export default async function AccountSettingsPage() {
  const [{ memberId }, t] = await Promise.all([
    requireHousehold(),
    getTranslations("dataExport"),
  ])
  const digestSubscribed = await isDigestSubscribed(getDb(), memberId)
  return (
    <div className="flex flex-col gap-6">
      <UserProfile routing="hash" />
      <DigestPreferenceToggle subscribed={digestSubscribed} />
      <section className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("description")}</p>
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
