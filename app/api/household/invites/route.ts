import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { getDb } from "@/lib/db"
import { requireHousehold } from "@/lib/household/current"
import { createInvite, InviteError, inviteErrorStatus } from "@/lib/household/invites"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Household Invites for the current tenant (ADR-0010). `GET` lists the active (pending, unexpired)
 * Invites; `POST` issues one for a given email — gated to Premium and to a free seat, re-issuing
 * (superseding) any live Invite already addressed to that email. The response carries the raw token
 * once so the client can build the shareable link; it is never retrievable again.
 */
export async function GET() {
  const { repo } = await requireHousehold()
  const invites = await repo.invites.listActive()
  return NextResponse.json(
    invites.map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt, createdAt: i.createdAt })),
  )
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const email = typeof body === "object" && body !== null ? (body as { email?: unknown }).email : undefined
  if (typeof email !== "string") {
    return NextResponse.json({ error: "email_required" }, { status: 400 })
  }

  const ctx = await requireHousehold()
  let rawToken: string
  let expiresAt: Date
  try {
    ;({ rawToken, expiresAt } = await createInvite({
      db: getDb(),
      householdId: ctx.householdId,
      plan: ctx.plan,
      invitedByMemberId: ctx.memberId,
      email,
      now: new Date(),
    }))
  } catch (error) {
    if (error instanceof InviteError) {
      return NextResponse.json({ error: error.code }, { status: inviteErrorStatus(error.code) })
    }
    throw error
  }
  // Log outside the try/catch so a logging failure isn't mistaken for an invite error.
  await recordActivity(ctx, ActivityAction.InviteCreated, { email, expiresAt })
  // `token` is returned exactly once; the client turns it into `${origin}/join/${token}`.
  return NextResponse.json({ token: rawToken, path: `/join/${rawToken}`, expiresAt }, { status: 201 })
}
