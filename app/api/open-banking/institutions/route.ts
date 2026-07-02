import { NextResponse } from "next/server"
import { unstable_rethrow } from "next/navigation"

import { requireHousehold } from "@/lib/household/current"
import { getIngestionProvider } from "@/lib/open-banking/provider-factory"
import { canUseBankSync } from "@/shared/bank-sync"

export const dynamic = "force-dynamic"

/** Supported banks are Icelandic; the picker defaults here (overridable via ?country=). */
const DEFAULT_COUNTRY = "IS"

/**
 * List the banks a household can connect (#119 — first-connect entry). Premium-only (same gate as the
 * connect route), so a Free household gets a 403 rather than the list. requireHousehold stays outside
 * the try so its sign-in redirect isn't swallowed; a provider/config failure becomes a clean 502.
 */
export async function GET(request: Request) {
  const { plan } = await requireHousehold()
  if (!canUseBankSync(plan)) {
    return NextResponse.json({ error: "upgrade_required" }, { status: 403 })
  }

  const country = new URL(request.url).searchParams.get("country") ?? DEFAULT_COUNTRY
  try {
    const institutions = await getIngestionProvider().listInstitutions(country)
    return NextResponse.json(institutions)
  } catch (error) {
    unstable_rethrow(error)
    console.error("GET /api/open-banking/institutions failed", error)
    return NextResponse.json({ error: "institutions_unavailable" }, { status: 502 })
  }
}
