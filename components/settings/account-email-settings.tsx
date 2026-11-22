"use client"

import { useReverification } from "@clerk/nextjs"
import type { EmailAddressResource, UserResource } from "@clerk/nextjs/types"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import {
  SettingsFeedback,
  SettingsSection,
  useSettingsAction,
} from "./settings-section"

export function AccountEmailSettings({ user }: { user: UserResource }) {
  const t = useTranslations("accountSettings")
  const common = useTranslations("identitySettings")
  const router = useRouter()
  const [verification, setVerification] = useState<EmailAddressResource>()
  const [confirmRemove, setConfirmRemove] = useState<string>()
  const { pending, feedback, run } = useSettingsAction()
  const createEmail = useReverification((email: string) =>
    user.createEmailAddress({ email })
  )
  const sendCode = useReverification((address: EmailAddressResource) =>
    address.prepareVerification({ strategy: "email_code" })
  )
  const verifyCode = useReverification(
    (address: EmailAddressResource, code: string) =>
      address.attemptVerification({ code })
  )
  const makePrimary = useReverification((id: string) =>
    user.update({ primaryEmailAddressId: id })
  )
  const removeEmail = useReverification((address: EmailAddressResource) =>
    address.destroy()
  )

  async function startVerification(address: EmailAddressResource) {
    setVerification(address)
    setConfirmRemove(undefined)
    await sendCode(address)
  }

  function addEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const email = String(new FormData(form).get("email")).trim()
    void run(
      async () => {
        const address = await createEmail(email)
        form.reset()
        await startVerification(address)
      },
      t("addEmailError"),
      t("codeSent")
    )
  }

  function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!verification) return
    const code = String(new FormData(event.currentTarget).get("code")).trim()
    void run(
      async () => {
        const address = await verifyCode(verification, code)
        if (address.verification.status !== "verified") throw new Error()
        await user.reload()
        setVerification(undefined)
        router.refresh()
      },
      t("codeError"),
      t("emailVerified")
    )
  }

  return (
    <SettingsSection title={t("emails")} description={t("emailDescription")}>
      <ul className="divide-y divide-border">
        {user.emailAddresses.map((address) => {
          const primary = address.id === user.primaryEmailAddressId
          const verified = address.verification?.status === "verified"
          return (
            <li
              key={address.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium break-all">{address.emailAddress}</p>
                <p className="text-muted-foreground">
                  {primary && <span className="me-2">{t("primaryEmail")}</span>}
                  {verified ? t("verified") : t("unverified")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {confirmRemove === address.id ? (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={pending}
                      onClick={() => {
                        void run(
                          async () => {
                            await removeEmail(address)
                            setConfirmRemove(undefined)
                            if (verification?.id === address.id)
                              setVerification(undefined)
                          },
                          t("removeEmailError"),
                          t("emailRemoved")
                        )
                      }}
                    >
                      {t("confirmRemoveEmail")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setConfirmRemove(undefined)}
                    >
                      {common("cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    {!verified && verification?.id !== address.id && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          void run(
                            () => startVerification(address),
                            t("sendCodeError"),
                            t("codeSent")
                          )
                        }}
                      >
                        {t("verifyEmail")}
                      </Button>
                    )}
                    {verified && !primary && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          void run(
                            async () => {
                              await makePrimary(address.id)
                              router.refresh()
                            },
                            t("primaryEmailError"),
                            t("primaryEmailSaved")
                          )
                        }}
                      >
                        {t("makePrimary")}
                      </Button>
                    )}
                    {!primary && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setConfirmRemove(address.id)}
                      >
                        {t("removeEmail")}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {verification ? (
        <form
          key={verification.id}
          onSubmit={verifyEmail}
          className="flex flex-col gap-3 border-t border-border pt-5"
        >
          <p className="text-sm break-words text-muted-foreground">
            {t("verificationDescription", { email: verification.emailAddress })}
          </p>
          <label className="flex max-w-52 flex-col gap-1.5 text-sm font-medium">
            {t("verificationCode")}
            <Input
              name="code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              disabled={pending}
              className="h-9 text-base pointer-fine:text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {t("verifyEmail")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                void run(
                  () => startVerification(verification),
                  t("sendCodeError"),
                  t("codeSent")
                )
              }}
            >
              {t("resendCode")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setVerification(undefined)}
            >
              {common("cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={addEmail}
          className="flex flex-wrap items-end gap-3 border-t border-border pt-5"
        >
          <label className="flex min-w-0 flex-1 basis-44 flex-col gap-1.5 text-sm font-medium">
            {t("newEmail")}
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pending}
              className="h-9 text-base pointer-fine:text-sm"
            />
          </label>
          <Button type="submit" className="h-9" disabled={pending}>
            {t("addEmail")}
          </Button>
        </form>
      )}
      <SettingsFeedback
        {...(pending ? { success: common("working") } : feedback)}
      />
    </SettingsSection>
  )
}
