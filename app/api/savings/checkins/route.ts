import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"
import { performCheckin } from "@/lib/savings/checkin"
import { parseCheckinInput } from "@/lib/savings/parse"

/**
 * Savings Check-ins for the current Household (ADR-0007, Phase J). `GET` lists the frozen
 * check-in history (oldest cycle first); `POST` freezes the CURRENT cycle from the Savings
 * config + net summary (optional one-off `cycleExtra` income) and returns the frozen row plus
 * the goal assessment. Re-posting within the same cycle re-freezes it in place. A check-in
 * needs an active goal and a started goal window — otherwise 409.
 */
export async function GET() {
  const { repo } = await requireHousehold()
  return NextResponse.json(await repo.savings.checkins.list())
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = parseCheckinInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const { repo } = await requireHousehold()
  const result = await performCheckin(repo, new Date(), parsed.value.cycleExtra)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }
  return NextResponse.json({ checkin: result.checkin, assessment: result.assessment })
}
