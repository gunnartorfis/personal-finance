"use client"

import {
  Check,
  CircleAlert,
  Copy,
  Loader2,
  LogOut,
  Mail,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { type FormEvent, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import type { Plan } from "@/shared/types"
import { cn } from "@/lib/utils"

interface Member {
  id: string
  authUserId: string
  name: string | null
  email: string | null
}

interface Invite {
  id: string
  email: string
  expiresAt: string
}

interface Props {
  plan: Plan
  cap: number
  currentUserId: string
  initialMembers: Member[]
  initialInvites: Invite[]
  className?: string
}

/**
 * Client surface for the Household screen (ADR-0010): the member list, the Premium-gated invite
 * form (which surfaces the one-time shareable link on success), the pending-invite list with
 * revoke, and the danger zone (Leave when others remain; Delete Household otherwise). Members are
 * rendered from the server snapshot; invites re-fetch after every mutation so the seat count stays
 * honest.
 */
export function HouseholdManager({
  plan,
  cap,
  currentUserId,
  initialMembers,
  initialInvites,
  className,
}: Props) {
  const [invites, setInvites] = useState<Invite[]>(initialInvites)
  const members = initialMembers
  const seatsUsed = members.length + invites.length

  const isPremium = plan === "Premium"
  const isFull = seatsUsed >= cap
  const canInvite = isPremium && !isFull
  const isSoleMember = members.length <= 1

  async function refreshInvites() {
    const res = await fetch("/api/household/invites")
    if (res.ok) setInvites((await res.json()) as Invite[])
  }

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      <MembersList members={members} currentUserId={currentUserId} />

      {isPremium ? (
        <InviteForm cap={cap} canInvite={canInvite} isFull={isFull} onCreated={refreshInvites} />
      ) : (
        <PremiumUpsell />
      )}

      {invites.length > 0 && <PendingInvites invites={invites} onChanged={refreshInvites} />}

      <DangerZone isSoleMember={isSoleMember} />
    </div>
  )
}

function MembersList({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const t = useTranslations("household")
  return (
    <section aria-label={t("members")} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t("members")}</h2>
      <ul
        role="list"
        className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card"
      >
        {members.map((member) => {
          const isYou = member.authUserId === currentUserId
          const label = member.name ?? member.email ?? t("memberFallback")
          return (
            <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {label}
                  {isYou && <span className="ml-2 text-xs text-muted-foreground">{t("you")}</span>}
                </span>
                {member.email && member.name && (
                  <span className="truncate text-xs text-muted-foreground">{member.email}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function InviteForm({
  cap,
  canInvite,
  isFull,
  onCreated,
}: {
  cap: number
  canInvite: boolean
  isFull: boolean
  onCreated: () => Promise<void>
}) {
  const t = useTranslations("household")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setLink(null)
    try {
      const res = await fetch("/api/household/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        // Map API error codes to statically-keyed messages (type-checked, no dynamic key).
        const byCode: Record<string, string> = {
          invalid_email: t("inviteError.invalidEmail"),
          cap_reached: t("inviteError.capReached"),
          not_premium: t("inviteError.notPremium"),
          email_required: t("inviteError.emailRequired"),
        }
        setError(byCode[body?.error ?? ""] ?? t("inviteError.generic"))
        return
      }
      const body = (await res.json()) as { path: string }
      setLink(`${window.location.origin}${body.path}`)
      setEmail("")
      await onCreated()
    } catch {
      setError(t("inviteError.generic"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label={t("invite")} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("invite")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("inviteDescription")}</p>
      </div>

      {isFull ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("full", { cap })}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium">
              {t("emailLabel")}
            </label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={!canInvite || busy}
              placeholder={t("emailPlaceholder")}
            />
          </div>
          <Button type="submit" disabled={!canInvite || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Mail />}
            {t("createInvite")}
          </Button>
        </form>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {link && <InviteLink url={link} />}
    </section>
  )
}

function InviteLink({ url }: { url: string }) {
  const t = useTranslations("household")
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — the URL stays selectable in the field as a fallback.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium">{t("linkReady")}</p>
      <div className="flex items-center gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="flex-1" />
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("linkHint")}</p>
    </div>
  )
}

function PremiumUpsell() {
  const t = useTranslations("household")
  return (
    <section
      aria-label={t("invite")}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold">{t("premiumTitle")}</h2>
      </div>
      <p className="text-sm text-pretty text-muted-foreground">{t("premiumDescription")}</p>
      <Button variant="outline" className="self-start" render={<Link href="/settings/billing" />}>
        {t("seePremium")}
      </Button>
    </section>
  )
}

function PendingInvites({ invites, onChanged }: { invites: Invite[]; onChanged: () => Promise<void> }) {
  const t = useTranslations("household")
  return (
    <section aria-label={t("pending")} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t("pending")}</h2>
      <ul
        role="list"
        className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card"
      >
        {invites.map((invite) => (
          <PendingInviteRow key={invite.id} invite={invite} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  )
}

function PendingInviteRow({ invite, onChanged }: { invite: Invite; onChanged: () => Promise<void> }) {
  const t = useTranslations("household")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const [busy, setBusy] = useState(false)

  async function revoke() {
    setBusy(true)
    try {
      const res = await fetch(`/api/household/invites/${invite.id}`, { method: "DELETE" })
      if (res.ok || res.status === 404) await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{invite.email}</span>
        <span className="text-xs text-muted-foreground">
          {t("expires", { date: formatDate(new Date(invite.expiresAt), locale) })}
        </span>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={revoke} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <X />}
        {t("revoke")}
      </Button>
    </li>
  )
}

function DangerZone({ isSoleMember }: { isSoleMember: boolean }) {
  const t = useTranslations("household")
  return (
    <section
      aria-label={t("dangerZone")}
      className="flex flex-col gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6"
    >
      <h2 className="text-sm font-semibold text-destructive">{t("dangerZone")}</h2>
      {isSoleMember ? (
        <DeleteHousehold />
      ) : (
        <>
          <LeaveHousehold />
          <div className="h-px bg-destructive/20" />
          <DeleteHousehold />
        </>
      )}
    </section>
  )
}

function LeaveHousehold() {
  const t = useTranslations("household")
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function leave() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/household/leave", { method: "POST" })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(
          body?.error === "last_member"
            ? t("leaveError.lastMember")
            : t("leaveError.generic"),
        )
        setBusy(false)
        return
      }
      window.location.assign("/")
    } catch {
      setError(t("leaveError.generic"))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-pretty text-muted-foreground">{t("leaveDescription")}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{t("leaveConfirmPrompt")}</span>
          <Button variant="destructive" onClick={leave} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <LogOut />}
            {t("leaveConfirm")}
          </Button>
          <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setConfirming(true)}>
          <LogOut />
          {t("leaveTrigger")}
        </Button>
      )}
    </div>
  )
}

function DeleteHousehold() {
  const t = useTranslations("household")
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function remove() {
    setBusy(true)
    setError(false)
    try {
      const res = await fetch("/api/household", { method: "DELETE" })
      if (!res.ok) {
        setError(true)
        setBusy(false)
        return
      }
      window.location.assign("/")
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-pretty text-muted-foreground">
        {t.rich("deleteDescription", { strong: (chunks) => <strong>{chunks}</strong> })}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("deleteError")}
        </p>
      )}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{t("deleteConfirmPrompt")}</span>
          <Button variant="destructive" onClick={remove} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {t("deleteConfirm")}
          </Button>
          <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <Button variant="destructive" className="self-start" onClick={() => setConfirming(true)}>
          <Trash2 />
          {t("deleteTrigger")}
        </Button>
      )}
    </div>
  )
}
