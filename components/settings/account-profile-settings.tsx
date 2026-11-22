"use client"

import { useReverification, useUser } from "@clerk/nextjs"
import type { UserResource } from "@clerk/nextjs/types"
import { UserRound } from "lucide-react"
import { useTranslations } from "next-intl"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Fragment, useRef, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { AccountEmailSettings } from "./account-email-settings"
import {
  SettingsFeedback,
  SettingsSection,
  useSettingsAction,
} from "./settings-section"

export function AccountProfileSettings() {
  const { isLoaded, user } = useUser()
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
      <ProfileDetails user={user} />
      <AccountEmailSettings user={user} />
    </Fragment>
  )
}

function ProfileDetails({ user }: { user: UserResource }) {
  const t = useTranslations("accountSettings")
  const common = useTranslations("identitySettings")
  const router = useRouter()
  const photoInput = useRef<HTMLInputElement>(null)
  const names = useSettingsAction()
  const photo = useSettingsAction()
  const pending = names.pending || photo.pending
  const updateName = useReverification((firstName: string, lastName: string) =>
    user.update({ firstName, lastName })
  )
  const updatePhoto = useReverification((file: File | null) =>
    user.setProfileImage({ file })
  )

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const fields = new FormData(event.currentTarget)
    const firstName = String(fields.get("firstName")).trim()
    const lastName = String(fields.get("lastName")).trim()
    void names.run(
      async () => {
        await updateName(firstName, lastName)
        router.refresh()
      },
      t("profileError"),
      t("profileSaved")
    )
  }

  function savePhoto(file: File | null) {
    if (pending) return
    void photo.run(
      async () => {
        await updatePhoto(file)
      },
      t("photoError"),
      t("photoSaved")
    )
  }

  return (
    <SettingsSection title={t("profile")}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {user.hasImage ? (
            <Image
              src={user.imageUrl}
              alt=""
              width={48}
              height={48}
              unoptimized
              className="size-12 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <UserRound aria-hidden="true" className="size-5" />
            </span>
          )}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            aria-label={t("uploadPhoto")}
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ""
              if (file) savePhoto(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => photoInput.current?.click()}
          >
            {photo.pending ? common("working") : t("uploadPhoto")}
          </Button>
          {user.hasImage && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => savePhoto(null)}
            >
              {t("removePhoto")}
            </Button>
          )}
        </div>
        <SettingsFeedback {...photo.feedback} />
      </div>
      <form
        onSubmit={saveName}
        className="flex flex-col gap-4 border-t border-border pt-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
            {t("firstName")}
            <Input
              name="firstName"
              autoComplete="given-name"
              defaultValue={user.firstName ?? ""}
              className="h-9 text-base pointer-fine:text-sm"
              disabled={pending}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
            {t("lastName")}
            <Input
              name="lastName"
              autoComplete="family-name"
              defaultValue={user.lastName ?? ""}
              className="h-9 text-base pointer-fine:text-sm"
              disabled={pending}
            />
          </label>
        </div>
        <SettingsFeedback {...names.feedback} />
        <Button type="submit" className="self-start" disabled={pending}>
          {names.pending ? common("working") : t("saveProfile")}
        </Button>
      </form>
    </SettingsSection>
  )
}
