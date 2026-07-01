import { NextResponse } from "next/server"

import { getDb } from "@/lib/db"
import { isDevResetEnabled } from "@/lib/dev/reset"
import { requireHousehold } from "@/lib/household/current"
import { resetHouseholdFinancialData } from "@/lib/household/reset"

/**
 * DEVELOPER TOOL (staging only): wipe the signed-in Household's financial data.
 *
 * Deletes all uploads, transactions, overrides, accounts, and merchant rules for the current
 * tenant (see `resetHouseholdFinancialData`), leaving the Household, its members, and plan intact.
 * Gated by `isDevResetEnabled()` — when the tool is off (production, or `ENABLE_DEV_RESET` unset)
 * the route responds 404 so it is indistinguishable from a non-existent endpoint.
 */
export async function POST() {
  if (!isDevResetEnabled()) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  const { householdId } = await requireHousehold()
  await resetHouseholdFinancialData(getDb(), householdId)
  return NextResponse.json({ ok: true })
}
