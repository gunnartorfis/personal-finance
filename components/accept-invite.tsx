"use client"

import { Check, CircleAlert, Loader2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

/**
 * Accept a Household Invite (ADR-0010) from either the link's raw `token` or an `inviteId` surfaced
 * on `/join`. Posts to `/api/household/invites/accept`; on success it hard-navigates to the
 * dashboard so every server component re-reads under the newly joined tenant. Error codes are
 * mapped to plain guidance — most importantly `already_in_household`, which tells the user to leave
 * their current household first.
 */
export function AcceptInvite({ token, inviteId }: { token?: string; inviteId?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/household/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token } : { inviteId }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(ACCEPT_ERROR_COPY[body?.error ?? ""] ?? "Couldn’t accept the invite.")
        setBusy(false)
        return
      }
      window.location.assign("/dashboard")
    } catch {
      setError("Couldn’t accept the invite.")
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      <Button onClick={accept} disabled={busy} className="self-start">
        {busy ? <Loader2 className="animate-spin" /> : <Check />}
        Accept invitation
      </Button>
    </div>
  )
}

const ACCEPT_ERROR_COPY: Record<string, string> = {
  already_in_household:
    "You already belong to a household. Leave or delete it first, then accept this invite.",
  email_mismatch: "This invite is for a different email. Sign in with the invited address.",
  email_not_verified: "Verify your email address first, then accept.",
  expired: "This invite has expired. Ask for a new one.",
  not_pending: "This invite has already been used or revoked.",
  not_found: "This invite could not be found.",
  cap_reached: "That household is now full.",
}
