import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { getDb } from "@/lib/db"
import { declineInvite, type InviteLocator } from "@/lib/household/invites"

// Auth-scoped per-request mutation; the decliner may or may not belong to a Household.
export const dynamic = "force-dynamic"

/**
 * Decline a Household Invite addressed to the current user (ADR-0010). Accepts `{ token }` (from the
 * shared link) or `{ inviteId }` (from `/join`); the email match is the authorization. Revokes the
 * pending Invite so the user stops being routed to `/join`, letting them keep their current Household.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  const body: unknown = await request.json().catch(() => null)
  const token = readString(body, "token")
  const inviteId = readString(body, "inviteId")
  const locator: InviteLocator | null = token ? { rawToken: token } : inviteId ? { inviteId } : null
  if (!locator) {
    return NextResponse.json({ error: "token_or_invite_id_required" }, { status: 400 })
  }

  await declineInvite({ db: getDb(), locator, email: user.email })
  return NextResponse.json({ ok: true })
}

function readString(body: unknown, key: string): string | undefined {
  const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined
  return typeof value === "string" && value.length > 0 ? value : undefined
}
