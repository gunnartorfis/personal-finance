"use client"

import { Dialog } from "@base-ui/react/dialog"
import { useReverification, useSession } from "@clerk/nextjs"
import type {
  SessionResource,
  SessionVerificationLevel,
  SessionVerificationResource,
} from "@clerk/nextjs/types"
import { useTranslations } from "next-intl"
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type ReverificationRequest = {
  level: SessionVerificationLevel | undefined
  complete: () => void
  cancel: () => void
}

const ReverificationContext = createContext<
  (request: ReverificationRequest) => void
>((request) => request.cancel())

export function useAppReverification<Args extends unknown[], Result>(
  fetcher: (...args: Args) => Promise<Result>
) {
  const onNeedsReverification = use(ReverificationContext)
  return useReverification(fetcher, { onNeedsReverification })
}

export function ReverificationProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  return (
    <SessionReverification key={session?.id} session={session}>
      {children}
    </SessionReverification>
  )
}

function SessionReverification({
  session,
  children,
}: {
  session: SessionResource | null | undefined
  children: ReactNode
}) {
  const activeRequest = useRef<ReverificationRequest>(undefined)
  const [request, setRequest] = useState<ReverificationRequest>()

  useEffect(() => () => activeRequest.current?.cancel(), [])

  function open(next: ReverificationRequest) {
    if (!session || activeRequest.current) {
      next.cancel()
      return
    }
    activeRequest.current = next
    setRequest(next)
  }

  function close(verified: boolean) {
    if (!request || activeRequest.current !== request) return
    activeRequest.current = undefined
    setRequest(undefined)
    if (verified) request.complete()
    else request.cancel()
  }

  return (
    <ReverificationContext value={open}>
      {children}
      {request && session && (
        <ReverificationDialog
          session={session}
          level={request.level}
          close={close}
        />
      )}
    </ReverificationContext>
  )
}

type Method = "password" | "email_code" | "totp" | "backup_code"

function ReverificationDialog({
  session,
  level = "first_factor",
  close,
}: {
  session: SessionResource
  level?: SessionVerificationLevel
  close: (verified: boolean) => void
}) {
  const t = useTranslations("auth")
  const [verification, setVerification] =
    useState<SessionVerificationResource>()
  const [method, setMethod] = useState<Method>()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const email = verification?.supportedFirstFactors?.find(
    (factor) => factor.strategy === "email_code"
  )
  const canUseBackup = verification?.supportedSecondFactors?.some(
    (factor) => factor.strategy === "backup_code"
  )

  async function sendEmail(result: SessionVerificationResource) {
    const factor = result.supportedFirstFactors?.find(
      (candidate) => candidate.strategy === "email_code"
    )
    if (!factor) throw new Error()
    setVerification(result)
    setMethod("email_code")
    await session.prepareFirstFactorVerification({
      strategy: "email_code",
      emailAddressId: factor.emailAddressId,
    })
  }

  async function advance(result: SessionVerificationResource) {
    if (result.status === "complete") {
      close(true)
      return
    }
    setVerification(result)
    if (result.status === "needs_first_factor") {
      if (
        result.supportedFirstFactors?.some(
          (factor) => factor.strategy === "password"
        )
      ) {
        setMethod("password")
        return
      }
      if (
        result.supportedFirstFactors?.some(
          (factor) => factor.strategy === "email_code"
        )
      ) {
        await sendEmail(result)
        return
      }
    } else if (result.status === "needs_second_factor") {
      if (
        result.supportedSecondFactors?.some(
          (factor) => factor.strategy === "totp"
        )
      ) {
        setMethod("totp")
        return
      }
      if (
        result.supportedSecondFactors?.some(
          (factor) => factor.strategy === "backup_code"
        )
      ) {
        setMethod("backup_code")
        return
      }
    }
    setMethod(undefined)
    setError(t("unsupportedVerification"))
  }

  async function run(operation: () => Promise<void>, errorMessage: string) {
    if (pending) return
    setPending(true)
    setError(undefined)
    try {
      await operation()
    } catch {
      setError(errorMessage)
    } finally {
      setPending(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = String(
      new FormData(event.currentTarget).get("credential") ?? ""
    )
    void run(
      async () => {
        if (method === "password") {
          await advance(
            await session.attemptFirstFactorVerification({
              strategy: "password",
              password: value,
            })
          )
        } else if (method === "email_code") {
          await advance(
            await session.attemptFirstFactorVerification({
              strategy: "email_code",
              code: value.trim(),
            })
          )
        } else if (method) {
          await advance(
            await session.attemptSecondFactorVerification({
              strategy: method,
              code: value.trim(),
            })
          )
        } else {
          await advance(await session.startVerification({ level }))
        }
      },
      method === "password"
        ? t("reverificationPasswordError")
        : method
          ? t("codeError")
          : t("tryAgain")
    )
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) close(false)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-1/2 flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-lg">
          <div className="flex flex-col gap-1">
            <Dialog.Title className="text-lg font-semibold">
              {t("reverificationTitle")}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              {t("reverificationDescription")}
            </Dialog.Description>
          </div>
          <form key={method} onSubmit={submit} className="flex flex-col gap-3">
            {method && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {method === "password"
                  ? t("password")
                  : method === "totp"
                    ? t("authenticatorCode")
                    : method === "backup_code"
                      ? t("backupCode")
                      : t("code")}
                <Input
                  name="credential"
                  type={method === "password" ? "password" : "text"}
                  autoComplete={
                    method === "password" ? "current-password" : "one-time-code"
                  }
                  inputMode={
                    method === "email_code" || method === "totp"
                      ? "numeric"
                      : undefined
                  }
                  required
                  disabled={pending}
                  className="h-10 text-base pointer-fine:text-sm"
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? t("working") : method ? t("verify") : t("continue")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => close(false)}
              >
                {t("cancel")}
              </Button>
            </div>
          </form>
          {verification &&
            email &&
            (method === "password" || method === "email_code") && (
              <Button
                type="button"
                variant="outline"
                className="self-start"
                disabled={pending}
                onClick={() => {
                  void run(() => sendEmail(verification), t("sendCodeError"))
                }}
              >
                {method === "password" ? t("useEmailCode") : t("resendCode")}
              </Button>
            )}
          {method === "totp" && canUseBackup && (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={pending}
              onClick={() => {
                setError(undefined)
                setMethod("backup_code")
              }}
            >
              {t("useBackupCode")}
            </Button>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
