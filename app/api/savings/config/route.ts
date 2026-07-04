import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"
import { parseSavingsConfigInput } from "@/lib/savings/parse"

/**
 * The current Household's Savings config (ADR-0007, Phase J): the recurring Monthly income
 * sources and Off-card fixed costs that feed the savings math. `GET` returns both lists; `PUT`
 * validates and replaces both in full (the config form saves the whole thing at once).
 */
export async function GET() {
  const { repo } = await requireHousehold()
  const [incomeSources, offcardCosts, oneOffAdjustments] = await Promise.all([
    repo.savings.incomeSources.list(),
    repo.savings.offcardCosts.list(),
    repo.savings.oneOffAdjustments.list(),
  ])
  return NextResponse.json({ incomeSources, offcardCosts, oneOffAdjustments })
}

export async function PUT(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = parseSavingsConfigInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const ctx = await requireHousehold()
  // One transaction for all lists — the config can never commit half-updated. `oneOffAdjustments`
  // is undefined when the body omits it (leave existing one-offs untouched), an array to replace.
  const saved = await ctx.repo.savings.replaceConfig(
    parsed.value.incomeSources,
    parsed.value.offcardCosts,
    parsed.value.oneOffAdjustments
  )
  // Source the counts from what was actually persisted (not the input), so the log can't diverge
  // from reality — consistent with the budgets route. A null one-off count means "left untouched".
  await recordActivity(ctx, ActivityAction.SavingsConfigUpdated, {
    incomeSources: saved.incomeSources.length,
    offcardCosts: saved.offcardCosts.length,
    oneOffAdjustments: saved.oneOffAdjustments?.length ?? null,
  })
  return NextResponse.json(saved)
}
