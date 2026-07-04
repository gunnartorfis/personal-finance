import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"
import { buildHouseholdExport } from "@/lib/household/export"

// Auth- and tenant-scoped; always dynamic.
export const dynamic = "force-dynamic"

/**
 * GDPR data export (#107): gather every financial row the Household owns and return it as a JSON
 * attachment the user can download. Tenant-scoped by `requireHousehold`; encrypted bank tokens are
 * stripped by {@link buildHouseholdExport}. 2FA and an audit log are separate, deferred parts of #107.
 */
export async function GET() {
  const ctx = await requireHousehold()
  const { repo, householdId } = ctx
  const [
    accounts,
    balances,
    uploads,
    transactions,
    overrides,
    merchantRules,
    bankConnections,
    goal,
    incomeSources,
    offcardCosts,
    oneOffAdjustments,
    budgets,
  ] = await Promise.all([
    repo.accounts.list(),
    repo.accounts.balances.list(),
    repo.uploads.list(),
    repo.transactions.list(),
    repo.overrides.list(),
    repo.merchantRules.list(),
    repo.bankConnections.list(),
    repo.savings.goal.get(),
    repo.savings.incomeSources.list(),
    repo.savings.offcardCosts.list(),
    repo.savings.oneOffAdjustments.list(),
    repo.budgets.list(),
  ])

  const data = buildHouseholdExport({
    accounts,
    balances,
    uploads,
    transactions,
    overrides,
    merchantRules,
    bankConnections,
    savings: { goal, incomeSources, offcardCosts, oneOffAdjustments },
    budgets,
  })

  // Best-effort audit log of the export (a privacy-relevant member action, #107). Must not block
  // the download if the log write fails.
  try {
    await recordActivity(ctx, ActivityAction.DataExported)
  } catch (logError) {
    console.error("failed to record data.exported activity", logError)
  }

  const body = JSON.stringify({ householdId, data }, null, 2)
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="finance-export.json"',
      // Don't let this sensitive payload linger in the browser disk cache (e.g. shared computers).
      "cache-control": "no-store",
    },
  })
}
