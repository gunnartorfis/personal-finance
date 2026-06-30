import { unstable_rethrow } from "next/navigation"
import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * GET /api/billing/status — the current Household's plan (ADR-0006). The checkout client polls this
 * after a Drop-in completion to confirm the (webhook-driven) Premium activation has landed, rather
 * than optimistically assuming it.
 */
export async function GET() {
  try {
    const { plan } = await requireHousehold()
    return NextResponse.json({ plan })
  } catch (error) {
    // Let requireHousehold's redirect()/notFound() control-flow pass through; log + 500 real failures
    // so a DB/auth error is observable rather than a silent 500 the client keeps polling against.
    unstable_rethrow(error)
    console.error("GET /api/billing/status failed", error)
    return NextResponse.json({ error: "status_failed" }, { status: 500 })
  }
}
