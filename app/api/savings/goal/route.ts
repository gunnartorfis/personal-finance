import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"
import { parseSavingsGoalInput } from "@/lib/savings/parse"

/**
 * The current Household's Savings goal (ADR-0007, Phase J). `GET` returns the goal (or `null`
 * when none is set — a Household has at most one in v1); `PUT` validates and upserts it, so
 * saving the form again updates the same goal in place.
 */
export async function GET() {
  const { repo } = await requireHousehold()
  const goal = await repo.savings.goal.get()
  return NextResponse.json(goal ?? null)
}

export async function PUT(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = parseSavingsGoalInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const ctx = await requireHousehold()
  const [goal] = await ctx.repo.savings.goal.upsert(parsed.value)
  if (!goal) throw new Error("savings goal upsert returned no rows")
  await recordActivity(ctx, ActivityAction.SavingsGoalUpdated)
  return NextResponse.json(goal)
}
