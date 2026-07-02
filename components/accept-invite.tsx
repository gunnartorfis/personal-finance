"use client"

import { Check, CircleAlert, Loader2, Trash2, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

/**
 * What accepting does to the user's *current* Household, if any (ADR-0010). Drives the accept
 * button's label, style, and whether a destructive confirm step is required — the warning copy
 * itself lives in {@link InviteCard}.
 * - `none` — the user has no Household; a plain join.
 * - `discard-empty` — sole Member of a pristine auto-provisioned Household; discarded silently.
 * - `delete` — sole Member of a Household with real data; accepting deletes it (needs confirm).
 * - `leave` — other Members remain; accepting leaves it (it stays with them).
 */
export type InviteConsequence = "none" | "discard-empty" | "delete" | "leave"

/**
 * Accept or decline a Household Invite (ADR-0010) from either the link's raw `token` or an
 * `inviteId` surfaced on `/join`. Accept posts to `/api/household/invites/accept` (with
 * `confirmSwitch` when the user is trading out an existing Household); a `delete` consequence gates
 * it behind an inline confirm. Decline posts to `/api/household/invites/decline`, revoking the Invite
 * so the user keeps their current Household. Both hard-navigate to the dashboard so every server
 * component re-reads under the resolved tenant.
 */
export function AcceptInvite({
  token,
  inviteId,
  consequence = "none",
}: {
  token?: string
  inviteId?: string
  consequence?: InviteConsequence
}) {
  const [busy, setBusy] = useState<null | "accept" | "decline">(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locatorBody = token ? { token } : { inviteId }
  const isSwitch = consequence !== "none"

  async function post(path: string, body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok) return true
    const parsed = (await res.json().catch(() => null)) as { error?: string } | null
    setError(ACCEPT_ERROR_COPY[parsed?.error ?? ""] ?? "Couldn’t accept the invite.")
    return false
  }

  async function accept() {
    // Deleting the current Household is irreversible — require a second, explicit click first.
    if (consequence === "delete" && !confirming) {
      setConfirming(true)
      return
    }
    setBusy("accept")
    setError(null)
    try {
      if (await post("/api/household/invites/accept", { ...locatorBody, confirmSwitch: isSwitch })) {
        window.location.assign("/dashboard")
        return
      }
    } catch {
      setError("Couldn’t accept the invite.")
    }
    setBusy(null)
    setConfirming(false)
  }

  async function decline() {
    setBusy("decline")
    setError(null)
    try {
      const res = await fetch("/api/household/invites/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(locatorBody),
      })
      if (res.ok) {
        window.location.assign("/dashboard")
        return
      }
      setError("Couldn’t decline the invite.")
    } catch {
      setError("Couldn’t decline the invite.")
    }
    setBusy(null)
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

      {confirming && consequence === "delete" && (
        <p className="text-sm font-medium text-destructive">
          This permanently deletes your current household and all its data.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={accept}
          disabled={busy !== null}
          variant={consequence === "delete" ? "destructive" : "default"}
        >
          {busy === "accept" ? (
            <Loader2 className="animate-spin" />
          ) : consequence === "delete" ? (
            <Trash2 />
          ) : (
            <Check />
          )}
          {acceptLabel(consequence, confirming)}
        </Button>

        {confirming ? (
          <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy !== null}>
            Cancel
          </Button>
        ) : (
          <Button variant="ghost" onClick={decline} disabled={busy !== null}>
            {busy === "decline" ? <Loader2 className="animate-spin" /> : <X />}
            Decline
          </Button>
        )}
      </div>
    </div>
  )
}

function acceptLabel(consequence: InviteConsequence, confirming: boolean): string {
  if (consequence === "delete") return confirming ? "Yes, delete & join" : "Delete household & join"
  if (consequence === "leave") return "Leave & join"
  return "Accept invitation"
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
