import { redirect } from "next/navigation"

import { type InviteConsequence } from "@/components/accept-invite"
import { InviteCard } from "@/components/invite-card"
import { VerifyEmailGate } from "@/components/verify-email-gate"
import { getCurrentUser } from "@/lib/auth/session"
import { getDb } from "@/lib/db"
import { getHouseholdActivity } from "@/lib/household/activity"
import { findActiveInvitesByEmail, getInviteCardDetails } from "@/lib/household/invites"
import { findMembership } from "@/lib/household/provision"

// Auth-scoped; the visitor may or may not already belong to a Household.
export const dynamic = "force-dynamic"

/**
 * The invite-acceptance screen (ADR-0010). Reached by a signed-in user with a pending Invite — both
 * brand-new users (routed here instead of being auto-provisioned a stray Household) and existing
 * Members (force-routed by the app layout so they can actually discover the Invite). Shows each
 * Invite as a card; for a Member it also spells out the one-Household consequence of accepting
 * (delete / leave / discard the empty starter). No pending Invite ⇒ back to the dashboard.
 */
export default async function JoinPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/sign-in")

  const db = getDb()
  const invites = await findActiveInvitesByEmail(db, user.email)
  if (invites.length === 0) redirect("/dashboard")

  if (!user.emailVerified) {
    return <VerifyEmailGate email={user.email} />
  }

  // The current Household (if any) decides what accepting costs: nothing for a new user, otherwise a
  // switch out of their existing one.
  const membership = await findMembership(db, user.id)
  const activity = membership ? await getHouseholdActivity(db, membership.householdId) : null

  const consequenceFor = (inviteHouseholdId: string): InviteConsequence => {
    if (!membership || !activity) return "none"
    if (inviteHouseholdId === membership.householdId) return "none"
    if (activity.memberCount > 1) return "leave"
    return activity.hasActivity ? "delete" : "discard-empty"
  }

  const cards = await Promise.all(
    invites.map(async (invite) => ({
      invite,
      details: await getInviteCardDetails(db, invite.householdId, invite.invitedByMemberId),
      consequence: consequenceFor(invite.householdId),
    })),
  )

  return (
    <JoinShell>
      {cards.length > 1 ? (
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Choose a household to join</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            You have {cards.length} pending invitations. You can join one.
          </p>
        </div>
      ) : (
        // A single card carries its own visible headline (the card's h2); keep an sr-only h1 so the
        // page still has a top-level heading for assistive tech and document outline.
        <h1 className="sr-only">Join a household</h1>
      )}
      <ul role="list" className="flex flex-col gap-4">
        {cards.map(({ invite, details, consequence }) => (
          <li key={invite.id}>
            <InviteCard
              invitedEmail={invite.email}
              inviterName={details.inviterName}
              inviterEmail={details.inviterEmail}
              memberCount={details.memberCount}
              expiresAt={invite.expiresAt}
              locator={{ inviteId: invite.id }}
              consequence={consequence}
            />
          </li>
        ))}
      </ul>
    </JoinShell>
  )
}

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-6 py-12">
      {children}
    </main>
  )
}
