import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { parseBudgetInput } from "@/lib/budgets/parse"
import { requireHousehold } from "@/lib/household/current"

/**
 * The current Household's per-category budgets (#103). `GET` returns the list; `PUT` validates and
 * replaces the whole set (the budgets form saves everything at once — an empty list clears them).
 */
export async function GET() {
  const { repo } = await requireHousehold()
  return NextResponse.json({ budgets: await repo.budgets.list() })
}

export async function PUT(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = parseBudgetInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const ctx = await requireHousehold()
  const saved = await ctx.repo.budgets.replace(parsed.value)
  await recordActivity(ctx, ActivityAction.BudgetsUpdated, { count: saved.length })
  return NextResponse.json({ budgets: saved })
}
