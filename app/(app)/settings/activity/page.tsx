import { getTranslations } from "next-intl/server"

import { ActivityLogView } from "@/components/activity-log-view"
import { loadActivityLog } from "@/lib/activity/load"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Activity log (ADR-0017, #107 Trust): the household's append-only record of who did what, when.
 * Every Member reads the whole log — the point is transparency between partners sharing one
 * financial picture. Read-only; entries are written by the routes that perform each mutation.
 */
export default async function ActivitySettingsPage() {
  const { repo } = await requireHousehold()
  const t = await getTranslations("activityLog")
  const entries = await loadActivityLog(repo)
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-pretty text-muted-foreground">{t("pageDescription")}</p>
      </header>
      <ActivityLogView entries={entries} />
    </div>
  )
}
