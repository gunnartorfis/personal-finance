import { redirect } from "next/navigation"

import { InviteCard } from "@/components/invite-card"
import { VerifyEmailGate } from "@/components/verify-email-gate"
import { getCurrentUser } from "@/lib/auth/session"
import { getDb } from "@/lib/db"
import { findActiveInvitesByEmail, getInviteCardDetails } from "@/lib/household/invites"
import { findMembership } from "@/lib/household/provision"

// Auth-scoped; the visitor may not (yet) belong to any Household.
export const dynamic = "force-dynamic"

/**
 * Landing screen for an invited user who signed in without the link (ADR-0010): the tenant guard
 * routes them here instead of auto-provisioning a stray Household. Shows the active Invites addressed
 * to their email as acceptance cards and lets them accept by id (the verified-email match is the
 * authorization). If they already belong to a Household, or have no pending Invite, they're sent on;
 * if they haven't verified their email yet they see the verification gate first.
 */
export default async function JoinPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/sign-in")

  const db = getDb()
  if (await findMembership(db, user.id)) redirect("/dashboard")

  const invites = await findActiveInvitesByEmail(db, user.email)
  if (invites.length === 0) redirect("/dashboard")

  if (!user.emailVerified) {
    return <VerifyEmailGate email={user.email} />
  }

  const cards = await Promise.all(
    invites.map(async (invite) => ({
      invite,
      details: await getInviteCardDetails(db, invite.householdId, invite.invitedByMemberId),
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
        {cards.map(({ invite, details }) => (
          <li key={invite.id}>
            <InviteCard
              invitedEmail={invite.email}
              inviterName={details.inviterName}
              inviterEmail={details.inviterEmail}
              memberCount={details.memberCount}
              expiresAt={invite.expiresAt}
              locator={{ inviteId: invite.id }}
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
