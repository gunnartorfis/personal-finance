import { getTranslations } from "next-intl/server"

import { ManageSubscription } from "@/components/manage-subscription"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Billing / subscription management (ADR-0006): shows the current plan and, for Premium, the
 * renewal date with a cancel action.
 */
export default async function BillingSettingsPage() {
  const { plan, planRenewsAt, subscriptionPeriod } = await requireHousehold()
  const t = await getTranslations("billing")

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-pretty text-muted-foreground">{t("subtitle")}</p>
      </header>
      <ManageSubscription
        plan={plan}
        planRenewsAt={planRenewsAt ? planRenewsAt.toISOString() : null}
        period={subscriptionPeriod}
      />
    </div>
  )
}
