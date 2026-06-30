import { ManageSubscription } from "@/components/manage-subscription"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Billing / subscription management (ADR-0006): shows the current plan and, for Premium, the
 * renewal date with a cancel action.
 */
export default async function BillingPage() {
  const { plan, planRenewsAt, subscriptionPeriod } = await requireHousehold()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <ManageSubscription
        plan={plan}
        planRenewsAt={planRenewsAt ? planRenewsAt.toISOString() : null}
        period={subscriptionPeriod}
      />
    </div>
  )
}
