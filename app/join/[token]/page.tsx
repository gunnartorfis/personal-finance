import Link from "next/link"
import { redirect } from "next/navigation"

import { AcceptInvite } from "@/components/accept-invite"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth/session"
import { getDb } from "@/lib/db"
import { getInvitePreviewByToken } from "@/lib/household/invites"

// Auth-scoped; the visitor may not (yet) belong to any Household.
export const dynamic = "force-dynamic"

/**
 * The invite link target (ADR-0010). Signed-out visitors are sent to sign in / sign up — after
 * which the tenant guard's intercept routes them to `/join` to accept. Signed-in visitors see the
 * invite (which email it's for, whether it's still valid) and accept via the raw token; the accept
 * endpoint re-validates the verified-email match and one-Household rule.
 */
export default async function JoinTokenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/auth/sign-in")

  const preview = await getInvitePreviewByToken(getDb(), token)
  const now = new Date()
  const invalid =
    !preview || preview.status !== "pending" || preview.expiresAt.getTime() <= now.getTime()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold tracking-tight">Join a household</h1>
      {invalid ? (
        <>
          <p className="text-sm text-pretty text-muted-foreground">
            This invite link is no longer valid — it may have been used, revoked, or expired. Ask
            the person who invited you to send a new one.
          </p>
          <Button variant="outline" className="self-start" render={<Link href="/dashboard" />}>
            Go to dashboard
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-pretty text-muted-foreground">
            This invite is for <strong>{preview.email}</strong>. Accept while signed in with that
            email to share the household’s combined finances.
          </p>
          <div className="rounded-xl border border-border bg-card p-4">
            <AcceptInvite token={token} />
          </div>
        </>
      )}
    </main>
  )
}
