import { unstable_rethrow } from "next/navigation"
import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"

/**
 * GET /api/assistant/status — the current Household's Plan (#101, slice 4b), so the drawer can show
 * the Premium upgrade CTA proactively instead of only after a rejected send.
 */
export async function GET() {
  try {
    const { plan } = await requireHousehold()
    return NextResponse.json({ plan })
  } catch (error) {
    unstable_rethrow(error)
    console.error("GET /api/assistant/status failed", error)
    return NextResponse.json({ error: "status_failed" }, { status: 500 })
  }
}
