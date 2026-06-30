import { NextResponse } from "next/server"

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

  const { repo } = await requireHousehold()
  try {
    const [rule] = await repo.merchantRules.create(parsed.value)
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
