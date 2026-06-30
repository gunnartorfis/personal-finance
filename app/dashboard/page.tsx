import { ClassifyTrigger } from "@/components/classify-trigger"
import { FreeCapStatusBanner } from "@/components/free-cap-status"
import { NetSummaryCard } from "@/components/net-summary-card"
import { freeCapStatus } from "@/lib/billing/free-cap-status"
import { cycleLabel, cycleRange } from "@/lib/dashboard/cycle"
import { loadNetSummary } from "@/lib/dashboard/net-summary"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped, per-request data: always render dynamically (no static prerender).
export const dynamic = "force-dynamic"

/**
 * The dashboard (Phase F): the current Household's net profit/loss for this statement cycle (the
 * calendar month) with a per-expense-type breakdown. `requireHousehold` enforces the tenant guard
 * and redirects to sign-in when there is no session, so this page is always rendered dynamically.
 */
export default async function DashboardPage() {
  const { repo, plan, billingCurrency } = await requireHousehold()
  const now = new Date()
  const [summary, classifiedCount] = await Promise.all([
    loadNetSummary(repo, cycleRange(now)),
    repo.transactions.countClassified(),
  ])
  const capStatus = freeCapStatus({ plan, classifiedCount })

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <FreeCapStatusBanner status={capStatus} />
      <NetSummaryCard summary={summary} currency={billingCurrency} cycleLabel={cycleLabel(now)} />
      <ClassifyTrigger />
    </main>
  )
}
