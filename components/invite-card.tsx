import { Clock, TriangleAlert, Users } from "lucide-react"
import { useTranslations } from "next-intl"

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
  const t = useTranslations("invites")
  const displayName = inviterName?.trim() || inviterEmail?.trim() || null
  const firstName = inviterName?.trim().split(/\s+/)[0]
  const headline = firstName ? t("headlineNamed", { name: firstName }) : t("headlineGeneric")
  const now = new Date()
  const expiry = expiryState(new Date(expiresAt), now)
  const expiryLabel = (() => {
    switch (expiry.kind) {
      case "expired":
        return t("expiry.expired")
      case "withinHour":
        return t("expiry.withinHour")
      case "hours":
        return t("expiry.inHours", { hours: expiry.value })
      case "tomorrow":
        return t("expiry.tomorrow")
      case "days":
        return t("expiry.inDays", { days: expiry.value })
    }
  })()

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
          <p className="truncate text-sm font-medium">{displayName ?? t("fallbackMember")}</p>
          {inviterName && inviterEmail && (
            <p className="truncate text-xs text-muted-foreground">{inviterEmail}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="max-w-[28ch] text-lg font-semibold tracking-tight text-balance">
          {headline}
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("joinBlurb")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MetaBadge icon={Users}>{t("memberCount", { count: memberCount })}</MetaBadge>
        <MetaBadge icon={Clock} urgent={expiry.urgent}>
          {expiryLabel}
        </MetaBadge>
      </div>

      {consequence !== "none" && <ConsequenceNotice consequence={consequence} />}

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-3">
        <AcceptInvite {...locator} consequence={consequence} />
        <p className="text-xs text-pretty text-muted-foreground">
          {t.rich("inviteFor", {
            email: invitedEmail,
            address: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          })}
          {consequence === "none" && ` ${t("oneHouseholdNote")}`}
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
  const t = useTranslations("invites")
  if (consequence === "discard-empty") {
    return (
      <p className="text-sm text-pretty text-muted-foreground">{t("consequence.discardEmpty")}</p>
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
        {isDelete
          ? t.rich("consequence.deleteWarning", {
              strong: (chunks) => <span className="font-medium">{chunks}</span>,
            })
          : t("consequence.leaveWarning")}
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

type ExpiryState =
  | { kind: "expired" | "withinHour" | "tomorrow"; urgent: boolean }
  | { kind: "hours" | "days"; value: number; urgent: boolean }

/**
 * Relative-expiry state; `urgent` (< 24h left) drives the warning-tinted badge. Copy is localized by
 * the caller, so this stays a pure time computation.
 */
function expiryState(expiresAt: Date, now: Date): ExpiryState {
  const ms = expiresAt.getTime() - now.getTime()
  if (ms <= 0) return { kind: "expired", urgent: true }

  const hours = Math.floor(ms / 3_600_000)
  if (hours < 24) {
    return hours <= 1
      ? { kind: "withinHour", urgent: true }
      : { kind: "hours", value: hours, urgent: true }
  }
  const days = Math.floor(hours / 24)
  return days === 1
    ? { kind: "tomorrow", urgent: false }
    : { kind: "days", value: days, urgent: false }
}
