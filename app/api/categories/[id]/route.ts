import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Mutate a single Category of the current Household (ADR-0020).
 *
 * - `PATCH` — hide or unhide a leaf (`{ hidden: boolean }`), a soft reversible prune. The write is
 *   Household-scoped, so another tenant's id resolves to nothing and returns 404 — never a silent
 *   cross-tenant write. Hiding a group is rejected (409): its leaves would stay visible to
 *   classification (ADR-0020).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid category id" }, { status: 400 })
  }
  const body = (await request.json().catch(() => null)) as { hidden?: unknown } | null
  if (!body || typeof body.hidden !== "boolean") {
    return NextResponse.json({ error: "hidden (boolean) is required" }, { status: 400 })
  }

  const { repo } = await requireHousehold()
  const result = await repo.categories.setHidden(id, body.hidden)
  if (!result.ok) {
    // Not in this Household → 404; a group (its leaves would stay classifiable) → 409.
    const status = result.error === "not_found" ? 404 : 409
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json(result.row)
}
