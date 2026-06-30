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
  const { plan } = await requireHousehold()
  return NextResponse.json({ plan })
}
