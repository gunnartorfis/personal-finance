import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Mutate a single Category of the current Household (ADR-0020).
 *
 * - `PATCH` — hide or unhide it (`{ hidden: boolean }`), a soft reversible prune. The write is
 *   Household-scoped, so another tenant's id resolves to nothing and returns 404 — never a silent
 *   cross-tenant write.
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
  const updated = await repo.categories.setHidden(id, body.hidden)
  if (!updated) {
    return NextResponse.json({ error: "category not found" }, { status: 404 })
  }
  return NextResponse.json(updated)
}
