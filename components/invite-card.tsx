import { Clock, TriangleAlert, Users } from "lucide-react"

import { AcceptInvite, type InviteConsequence } from "@/components/accept-invite"
import { cn } from "@/lib/utils"

interface InviteCardProps {
  /** The email the invite is bound to — the address the user must be signed in with to accept. */
  invitedEmail: string
  inviterName: string | null
  inviterEmail: string | null
  /** Members already in the household (the invitee isn't counted yet). */
  memberCount: number
  expiresAt: Date | string
  /** How `AcceptInvite` locates the invite — the link's raw `token` or an `inviteId` from `/join`. */
  locator: { token: string } | { inviteId: string }
  /** What accepting does to the user's current household, if any (drives the warning + button). */
  consequence?: InviteConsequence
}

/**
 * The pending-invite acceptance card (ADR-0010). Households are unnamed, so the invite is framed by
 * the person who sent it. Shown to a signed-in invitee on `/join` (by id) and `/join/[token]` (by
 * token); the actual accept + error handling lives in the client `AcceptInvite`, which this wraps.
 */
export function InviteCard({
  invitedEmail,
  inviterName,
  inviterEmail,
  memberCount,
  expiresAt,
  locator,
  consequence = "none",
}: InviteCardProps) {
  const displayName = inviterName?.trim() || inviterEmail?.trim() || null
  const firstName = inviterName?.trim().split(/\s+/)[0]
  const headline = firstName
    ? `${firstName} invited you to their household`
    : "You’ve been invited to a household"
  const now = new Date()
  const expiry = formatExpiry(new Date(expiresAt), now)

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10"
        >
          {initialsFor(inviterName, inviterEmail)}
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-sm font-medium">{displayName ?? "A household member"}</p>
          {inviterName && inviterEmail && (
            <p className="truncate text-xs text-muted-foreground">{inviterEmail}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="max-w-[28ch] text-lg font-semibold tracking-tight text-balance">
          {headline}
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Join to share one combined view of your money — accounts, transactions, and savings, all in
          one place.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MetaBadge icon={Users}>
          {memberCount === 1 ? "1 member" : `${memberCount} members`}
        </MetaBadge>
        <MetaBadge icon={Clock} urgent={expiry.urgent}>
          {expiry.label}
        </MetaBadge>
      </div>

      {consequence !== "none" && <ConsequenceNotice consequence={consequence} />}

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-3">
        <AcceptInvite {...locator} consequence={consequence} />
        <p className="text-xs text-pretty text-muted-foreground">
          This invite is for <span className="font-medium text-foreground">{invitedEmail}</span>.
          {consequence === "none" && " You can belong to one household at a time."}
        </p>
      </div>
    </div>
  )
}

/**
 * The one-household consequence of accepting, when the user already has a household. `delete` is the
 * loud, destructive case (sole member of a household with real data); `leave` is milder (it survives
 * for others); `discard-empty` is a quiet aside (a pristine starter household costs nothing to drop).
 */
function ConsequenceNotice({ consequence }: { consequence: InviteConsequence }) {
  if (consequence === "discard-empty") {
    return (
      <p className="text-sm text-pretty text-muted-foreground">
        You’ll join with a clean slate — your empty starter household will be removed.
      </p>
    )
  }

  const isDelete = consequence === "delete"
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        isDelete
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-500",
      )}
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="text-pretty">
        {isDelete ? (
          <>
            You’re the only member of your current household. Accepting{" "}
            <span className="font-medium">permanently deletes it and all its data</span> —
            transactions, accounts, rules, and savings. This can’t be undone.
          </>
        ) : (
          <>
            You’ll leave your current household to join this one. It stays with its other members;
            you’ll lose access to it.
          </>
        )}
      </p>
    </div>
  )
}

function MetaBadge({
  icon: Icon,
  urgent = false,
  children,
}: {
  icon: typeof Clock
  urgent?: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border py-1 pr-2 pl-1.5 text-xs font-medium",
        urgent
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {children}
    </span>
  )
}

/** Two-letter initials from a name (first + last), else the first two chars of name/email. */
function initialsFor(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || ""
  if (!source) return "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

/** Relative expiry copy; `urgent` (< 24h left) drives the warning-tinted badge. */
function formatExpiry(expiresAt: Date, now: Date): { label: string; urgent: boolean } {
  const ms = expiresAt.getTime() - now.getTime()
  if (ms <= 0) return { label: "Expired", urgent: true }

  const hours = Math.floor(ms / 3_600_000)
  if (hours < 24) {
    return { label: hours <= 1 ? "Expires within the hour" : `Expires in ${hours} hours`, urgent: true }
  }
  const days = Math.floor(hours / 24)
  return { label: days === 1 ? "Expires tomorrow" : `Expires in ${days} days`, urgent: false }
}
