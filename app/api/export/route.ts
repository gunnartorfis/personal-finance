import { NextResponse } from "next/server"

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
  const { repo, householdId } = await requireHousehold()
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

  const body = JSON.stringify({ householdId, data }, null, 2)
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="finance-export.json"',
    },
  })
}
