import { redirect } from "next/navigation"

import { AcceptInvite } from "@/components/accept-invite"
import { getCurrentUser } from "@/lib/auth/session"
import { getDb } from "@/lib/db"
import { findActiveInvitesByEmail } from "@/lib/household/invites"
import { findMembership } from "@/lib/household/provision"

// Auth-scoped; the visitor may not (yet) belong to any Household.
export const dynamic = "force-dynamic"

/**
 * Landing screen for an invited user who signed in without the link (ADR-0010): the tenant guard
 * routes them here instead of auto-provisioning a stray Household. Lists the active Invites
 * addressed to their verified email and lets them accept by id (the verified-email match is the
 * authorization). If they already belong to a Household, or have no pending Invite, they're sent on.
 */
export default async function JoinPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/sign-in")

  const db = getDb()
  if (await findMembership(db, user.id)) redirect("/dashboard")

  if (!user.emailVerified) {
    return (
      <JoinShell>
        <h1 className="text-xl font-semibold tracking-tight">Verify your email to join</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Your invitation was sent to <strong>{user.email}</strong>. Verify this email address, then
          reload this page to accept.
        </p>
      </JoinShell>
    )
  }

  const invites = await findActiveInvitesByEmail(db, user.email)
  if (invites.length === 0) redirect("/dashboard")

  return (
    <JoinShell>
      <h1 className="text-xl font-semibold tracking-tight">Join a household</h1>
      <p className="text-sm text-pretty text-muted-foreground">
        You’ve been invited to share a household’s combined finances. Accept to join.
      </p>
      <ul role="list" className="flex flex-col gap-3">
        {invites.map((invite) => (
          <li key={invite.id} className="rounded-xl border border-border bg-card p-4">
            <AcceptInvite inviteId={invite.id} />
          </li>
        ))}
      </ul>
    </JoinShell>
  )
}

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 p-6">
      {children}
    </main>
  )
}
