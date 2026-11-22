"use client"

import { useReverification, useSession, useUser } from "@clerk/nextjs"
import { isClerkAPIResponseError } from "@clerk/nextjs/errors"
import type {
  SessionWithActivitiesResource,
  UserResource,
} from "@clerk/nextjs/types"
import { Laptop, Smartphone } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { Fragment, useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"

import {
  SettingsFeedback,
  SettingsSection,
  useSettingsAction,
} from "./settings-section"

export function AccountSecuritySettings() {
  const { isLoaded, user } = useUser()
  const { session } = useSession()
  const t = useTranslations("identitySettings")

  if (!isLoaded)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("loading")}
      </p>
    )
  if (!user)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("signedOut")}
      </p>
    )

  return (
    <Fragment key={user.id}>
      <PasswordSettings user={user} />
      <SessionSettings
        key={session?.id}
        user={user}
        currentSessionId={session?.id}
      />
    </Fragment>
  )
}

function PasswordSettings({ user }: { user: UserResource }) {
  const t = useTranslations("securitySettings")
  const common = useTranslations("identitySettings")
  const { pending, feedback, run } = useSettingsAction()
  const updatePassword = useReverification(
    (newPassword: string, currentPassword?: string) =>
      user.updatePassword({ newPassword, currentPassword })
  )

  function passwordError(cause: unknown) {
    const code = isClerkAPIResponseError(cause)
      ? cause.errors[0]?.code
      : undefined
    switch (code) {
      case "form_password_incorrect":
        return t("currentPasswordIncorrect")
      case "form_password_pwned":
        return t("passwordExposed")
      case "form_password_length_too_short":
      case "form_password_length_too_long":
      case "form_password_validation_failed":
        return t("passwordRequirements")
      default:
        return t("passwordError")
    }
  }

  function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const currentPassword = fields.get("currentPassword")
    const newPassword = String(fields.get("newPassword"))
    void run(
      async () => {
        await updatePassword(
          newPassword,
          typeof currentPassword === "string" ? currentPassword : undefined
        )
        form.reset()
      },
      passwordError,
      t("passwordSaved")
    )
  }

  return (
    <SettingsSection
      title={t("password")}
      description={t("passwordDescription")}
    >
      <form onSubmit={savePassword} className="flex flex-col gap-4">
        {user.passwordEnabled && (
          <label className="flex max-w-sm flex-col gap-1.5 text-sm font-medium">
            {t("currentPassword")}
            <Input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
              className="h-9 text-base pointer-fine:text-sm"
            />
          </label>
        )}
        <label className="flex max-w-sm flex-col gap-1.5 text-sm font-medium">
          {t("newPassword")}
          <Input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            disabled={pending}
            className="h-9 text-base pointer-fine:text-sm"
          />
        </label>
        <SettingsFeedback {...feedback} />
        <Button type="submit" className="self-start" disabled={pending}>
          {pending
            ? common("working")
            : user.passwordEnabled
              ? t("changePassword")
              : t("setPassword")}
        </Button>
      </form>
    </SettingsSection>
  )
}

function SessionSettings({
  user,
  currentSessionId,
}: {
  user: UserResource
  currentSessionId?: string
}) {
  const t = useTranslations("securitySettings")
  const common = useTranslations("identitySettings")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const [sessions, setSessions] = useState<
    SessionWithActivitiesResource[] | "error"
  >()
  const loadingSessions = sessions === undefined
  const [confirmRevoke, setConfirmRevoke] = useState<string>()
  const { pending, feedback, run } = useSettingsAction()
  const revokeSession = useReverification(
    (session: SessionWithActivitiesResource) => session.revoke()
  )

  useEffect(() => {
    if (!loadingSessions) return
    let active = true
    void user.getSessions().then(
      (result) => {
        if (active)
          setSessions(result.filter((session) => session.status === "active"))
      },
      () => {
        if (active) setSessions("error")
      }
    )
    return () => {
      active = false
    }
  }, [user, loadingSessions])

  function revoke(session: SessionWithActivitiesResource) {
    void run(
      async () => {
        await revokeSession(session)
        setSessions((current) =>
          Array.isArray(current)
            ? current.filter(({ id }) => id !== session.id)
            : current
        )
        setConfirmRevoke(undefined)
      },
      t("revokeError"),
      t("sessionRevoked")
    )
  }

  return (
    <SettingsSection
      title={t("sessions")}
      description={t("sessionsDescription")}
    >
      {sessions === "error" ? (
        <div className="flex flex-col items-start gap-3">
          <SettingsFeedback error={t("sessionsError")} />
          <Button
            type="button"
            variant="outline"
            onClick={() => setSessions(undefined)}
          >
            {common("retry")}
          </Button>
        </div>
      ) : !sessions ? (
        <SettingsFeedback success={common("loading")} />
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noSessions")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.map((session) => {
            const activity = session.latestActivity
            const DeviceIcon = activity?.isMobile ? Smartphone : Laptop
            const current = session.id === currentSessionId
            return (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <DeviceIcon aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium break-words">
                      {activity?.browserName || t("unknownDevice")}
                    </p>
                    <p className="text-muted-foreground">
                      {current
                        ? t("currentSession")
                        : t("lastActive", {
                            date: formatDate(session.lastActiveAt, locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }),
                          })}
                    </p>
                  </div>
                </div>
                {currentSessionId && !current && (
                  <div className="flex flex-wrap gap-2">
                    {confirmRevoke === session.id ? (
                      <>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => revoke(session)}
                          disabled={pending}
                        >
                          {pending ? common("working") : t("confirmRevoke")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setConfirmRevoke(undefined)}
                          disabled={pending}
                        >
                          {common("cancel")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConfirmRevoke(session.id)}
                        disabled={pending}
                      >
                        {t("revoke")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <SettingsFeedback {...feedback} />
    </SettingsSection>
  )
}
