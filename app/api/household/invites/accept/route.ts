import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { getDb } from "@/lib/db"
import {
  acceptInvite,
  InviteError,
  inviteErrorStatus,
  type InviteLocator,
} from "@/lib/household/invites"

// Auth-scoped per-request mutation; the accepter may not yet belong to any Household.
export const dynamic = "force-dynamic"

/**
 * Redeem a Household Invite (ADR-0010). Accepts either `{ token }` (from the shared link) or
 * `{ inviteId }` (from the `/join` list); the verified-email match is the authorization in both
 * cases. Uses the session user directly rather than `requireHousehold`, since a valid accepter is
 * precisely someone who does NOT yet have a Household. Returns the joined `householdId`.
 */
export async function POST(request: Request) {
  // Fresh read (bypass the session-data cookie) so a just-verified email is honored at accept time —
  // a cached `emailVerified: false` would otherwise reject the accept with `email_not_verified`.
  const user = await getCurrentUser({ fresh: true })
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
  const confirmSwitch = readBoolean(body, "confirmSwitch")
  const confirmDelete = readBoolean(body, "confirmDelete")

  try {
    const { householdId } = await acceptInvite({
      db: getDb(),
      locator,
      authUserId: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      confirmSwitch,
      confirmDelete,
      now: new Date(),
    })
    return NextResponse.json({ ok: true, householdId })
  } catch (error) {
    if (error instanceof InviteError) {
      return NextResponse.json({ error: error.code }, { status: inviteErrorStatus(error.code) })
    }
    throw error
  }
}

function readString(body: unknown, key: string): string | undefined {
  const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readBoolean(body: unknown, key: string): boolean {
  const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined
  return value === true
}
