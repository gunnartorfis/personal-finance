"use client"

import { Check, CircleAlert, Loader2, Trash2, X } from "lucide-react"
import { useTranslations } from "next-intl"
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
  const t = useTranslations("invites")
  const [busy, setBusy] = useState<null | "accept" | "decline">(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locatorBody = token ? { token } : { inviteId }
  const isSwitch = consequence !== "none"

  async function accept() {
    // Deleting the current Household is irreversible — require a second, explicit click first.
    if (consequence === "delete" && !confirming) {
      setConfirming(true)
      return
    }
    setBusy("accept")
    setError(null)
    try {
      const res = await fetch("/api/household/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...locatorBody,
          confirmSwitch: isSwitch,
          confirmDelete: consequence === "delete",
        }),
      })
      if (res.ok) {
        window.location.assign("/dashboard")
        return
      }
      const parsed = (await res.json().catch(() => null)) as { error?: string } | null
      if (parsed?.error === "confirm_delete_required") {
        // The current household changed since this page loaded (its other members left), so the
        // switch would now delete it and its data. Reload to show the destructive warning + confirm.
        window.location.reload()
        return
      }
      // Map API error codes to statically-keyed messages (type-checked, no dynamic key).
      const byCode: Record<string, string> = {
        already_in_household: t("acceptError.alreadyInHousehold"),
        email_mismatch: t("acceptError.emailMismatch"),
        email_not_verified: t("acceptError.emailNotVerified"),
        expired: t("acceptError.expired"),
        not_pending: t("acceptError.notPending"),
        not_found: t("acceptError.notFound"),
        cap_reached: t("acceptError.capReached"),
      }
      setError(byCode[parsed?.error ?? ""] ?? t("acceptError.generic"))
    } catch {
      setError(t("acceptError.generic"))
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
      setError(t("declineError"))
    } catch {
      setError(t("declineError"))
    }
    setBusy(null)
  }

  const acceptLabel =
    consequence === "delete"
      ? confirming
        ? t("accept.deleteConfirm")
        : t("accept.delete")
      : consequence === "leave"
        ? t("accept.leave")
        : t("accept.default")

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
        <p className="text-sm font-medium text-destructive">{t("confirmDeleteNote")}</p>
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
          {acceptLabel}
        </Button>

        {confirming ? (
          <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy !== null}>
            {t("cancel")}
          </Button>
        ) : (
          <Button variant="ghost" onClick={decline} disabled={busy !== null}>
            {busy === "decline" ? <Loader2 className="animate-spin" /> : <X />}
            {t("decline")}
          </Button>
        )}
      </div>
    </div>
  )
}
