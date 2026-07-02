import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"
import { parseSavingsConfigInput } from "@/lib/savings/parse"

/**
 * The current Household's Savings config (ADR-0007, Phase J): the recurring Monthly income
 * sources and Off-card fixed costs that feed the savings math. `GET` returns both lists; `PUT`
 * validates and replaces both in full (the config form saves the whole thing at once).
 */
export async function GET() {
  const { repo } = await requireHousehold()
  const [incomeSources, offcardCosts] = await Promise.all([
    repo.savings.incomeSources.list(),
    repo.savings.offcardCosts.list(),
  ])
  return NextResponse.json({ incomeSources, offcardCosts })
}

export async function PUT(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = parseSavingsConfigInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const { repo } = await requireHousehold()
  // One transaction for both lists — the config can never commit half-updated.
  const saved = await repo.savings.replaceConfig(
    parsed.value.incomeSources,
    parsed.value.offcardCosts
  )
  return NextResponse.json(saved)
}
