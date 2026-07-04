import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { isUniqueViolation } from "@/lib/db/errors"
import { requireHousehold } from "@/lib/household/current"
import { parseMerchantRuleInput } from "@/lib/merchant-rules/parse"

/**
 * Merchant rules for the current Household (Phase F): a household-level mapping from a merchant to
 * an Expense type, applied before AI classification. `GET` lists them; `POST` creates one (flat or
 * split — see {@link parseMerchantRuleInput}). One rule per normalized merchant, so a duplicate is
 * a 409.
 */
export async function GET() {
  const { repo } = await requireHousehold()
  return NextResponse.json(await repo.merchantRules.list())
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = parseMerchantRuleInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const ctx = await requireHousehold()
  try {
    // Create the rule and re-type existing matching rows atomically, so the rule takes effect
    // immediately (CONTEXT.md) and a crash can't leave rows un-retyped. Overrides are untouched.
    const { rule } = await ctx.repo.merchantRules.createAndApply(parsed.value)
    await recordActivity(ctx, ActivityAction.MerchantRuleCreated, {
      ruleId: rule.id,
      merchant: rule.merchant,
    })
    return NextResponse.json(rule, { status: 201 })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "a rule already exists for this merchant" },
        { status: 409 },
      )
    }
    throw error
  }
}
