import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request mutation.
export const dynamic = "force-dynamic"

/**
 * Revoke a pending Household Invite (ADR-0010). Any Member may revoke; a non-pending or foreign id
 * matches nothing and returns 404 (indistinguishable from an already-settled Invite). Scoping is by
 * the tenant repo, so an id from another Household can never be revoked here.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireHousehold()
  const [revoked] = await ctx.repo.invites.revoke(id)
  if (!revoked) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  await recordActivity(ctx, ActivityAction.InviteRevoked, {
    inviteId: id,
    email: revoked.email,
  })
  return NextResponse.json({ ok: true })
}
