import { NextResponse } from "next/server"

import { resolveActorName } from "@/lib/activity/actor"
import { getDb } from "@/lib/db"
import { requireHousehold } from "@/lib/household/current"
import { resetHouseholdFinancialData } from "@/lib/household/reset"
import { isHouseholdResetEnabled } from "@/lib/household/reset-availability"

/**
 * Wipe the signed-in Household's financial data.
 *
 * Deletes all uploads, transactions, overrides, accounts, and merchant rules for the current
 * tenant (see `resetHouseholdFinancialData`), leaving the Household, its members, and plan intact.
 * Gated by `isHouseholdResetEnabled()` — when the tool is off (`ENABLE_HOUSEHOLD_RESET` unset) the
 * route responds 404 so it is indistinguishable from a non-existent endpoint.
 */
export async function POST() {
  if (!isHouseholdResetEnabled()) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  const { user, householdId, memberId } = await requireHousehold()
  await resetHouseholdFinancialData(getDb(), householdId, {
    memberId,
    actorName: resolveActorName(user),
  })
  return NextResponse.json({ ok: true })
}
