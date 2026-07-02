import Link from "next/link"
import { redirect } from "next/navigation"

import { type InviteConsequence } from "@/components/accept-invite"
import { InviteCard } from "@/components/invite-card"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth/session"
import { getDb } from "@/lib/db"
import { getHouseholdActivity } from "@/lib/household/activity"
import { getInviteCardDetails, getInvitePreviewByToken } from "@/lib/household/invites"
import { findMembership } from "@/lib/household/provision"

// Auth-scoped; the visitor may not (yet) belong to any Household.
export const dynamic = "force-dynamic"

/**
 * The invite link target (ADR-0010). Signed-out visitors are sent to sign in / sign up — after
 * which the tenant guard's intercept routes them to `/join` to accept. Signed-in visitors see the
 * invite (who sent it, which email it's for, whether it's still valid) and accept via the raw token;
 * the accept endpoint re-validates the verified-email match and one-Household rule.
 */
export default async function JoinTokenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/auth/sign-in")

  const db = getDb()
  const preview = await getInvitePreviewByToken(db, token)
  const now = new Date()
  const invalid =
    !preview || preview.status !== "pending" || preview.expiresAt.getTime() <= now.getTime()

  if (invalid) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-6 py-12">
        <h1 className="text-xl font-semibold tracking-tight">Invite link no longer valid</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          This invite link may have been used, revoked, or expired. Ask the person who invited you to
          send a new one.
        </p>
        <Button variant="outline" className="self-start" render={<Link href="/dashboard" />}>
          Go to dashboard
        </Button>
      </main>
    )
  }

  const [details, membership] = await Promise.all([
    getInviteCardDetails(db, preview.householdId, preview.invitedByMemberId),
    findMembership(db, user.id),
  ])

  // If they already belong to a Household, spell out what accepting costs (a switch out of it).
  let consequence: InviteConsequence = "none"
  if (membership && membership.householdId !== preview.householdId) {
    const activity = await getHouseholdActivity(db, membership.householdId)
    consequence = activity.memberCount > 1 ? "leave" : activity.hasActivity ? "delete" : "discard-empty"
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-6 py-12">
      {/* The card's h2 is the visible headline; keep an sr-only h1 for the document outline. */}
      <h1 className="sr-only">Join a household</h1>
      <InviteCard
        invitedEmail={preview.email}
        inviterName={details.inviterName}
        inviterEmail={details.inviterEmail}
        memberCount={details.memberCount}
        expiresAt={preview.expiresAt}
        locator={{ token }}
        consequence={consequence}
      />
    </main>
  )
}
