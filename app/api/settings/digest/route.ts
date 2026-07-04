import { NextResponse } from "next/server"

import { getDb } from "@/lib/db"
import { setDigestSubscription } from "@/lib/digest/subscription"
import { requireHousehold } from "@/lib/household/current"

/**
 * Persist the signed-in Member's Digest subscription (#102, ADR-0019) — the settings-page toggle.
 * `requireHousehold` scopes the write to the current tenant's Member (the client never supplies the
 * member id). Mirror of the locale settings route.
 */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null)
  if (typeof body?.subscribed !== "boolean") {
    return NextResponse.json({ error: "subscribed must be a boolean" }, { status: 400 })
  }

  const { memberId } = await requireHousehold()
  await setDigestSubscription(getDb(), memberId, body.subscribed)

  return NextResponse.json({ subscribed: body.subscribed })
}
