import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * DELETE /api/merchant-rules/:id — remove one of the current Household's merchant rules. Scoped
 * through the repo, so an unknown or other-tenant id is a 404 rather than a silent no-op.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid rule id" }, { status: 400 })
  }

  const ctx = await requireHousehold()
  const removed = await ctx.repo.merchantRules.remove(id)
  if (removed.length === 0) {
    return NextResponse.json({ error: "rule not found" }, { status: 404 })
  }
  await recordActivity(ctx, ActivityAction.MerchantRuleDeleted, {
    ruleId: id,
    merchant: removed[0].merchant,
  })
  return NextResponse.json({ removed: true })
}
