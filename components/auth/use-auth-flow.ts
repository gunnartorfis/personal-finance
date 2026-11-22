"use client"

import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs"
import type { SetActiveNavigate } from "@clerk/nextjs/types"
import { useTranslations } from "next-intl"
import { useState, type FormEvent } from "react"

type Step =
  | "password"
  | "email"
  | "signUp"
  | "forgot"
  | "signInCode"
  | "signUpCode"
  | "deviceCode"
  | "resetCode"
  | "newPassword"
  | "totp"
  | "backup"
type CodeStep =
  | "signInCode"
  | "signUpCode"
  | "deviceCode"
  | "resetCode"
  | "totp"
  | "backup"

function check(result: { error: unknown }) {
  if (result.error) throw result.error
}

function isCodeStep(step: Step): step is CodeStep {
  return (
    step === "signInCode" ||
    step === "signUpCode" ||
    step === "deviceCode" ||
    step === "resetCode" ||
    step === "totp" ||
    step === "backup"
  )
}

export function useAuthFlow({
  signUpPage = false,
  returnTo,
}: {
  signUpPage?: boolean
  returnTo: string
}) {
  const t = useTranslations("auth")
  const { loaded, session } = useClerk()
  const { signIn } = useSignIn()
  const { signUp } = useSignUp()
  const initialStep = signUpPage ? "signUp" : "password"
  const [{ step, email }, setScreen] = useState<{ step: Step; email: string }>({
    step: initialStep,
    email: "",
  })
  const [{ error, notice }, setFeedback] = useState<{
    error?: string
    notice?: string
  }>({})
  const [pending, setPending] = useState(false)

  const codeStep = isCodeStep(step)

  function setStep(next: Step) {
    setScreen((screen) => ({ ...screen, step: next }))
  }

  function setEmail(value: string) {
    setScreen((screen) => ({ ...screen, email: value }))
  }

  const navigate: SetActiveNavigate = ({ session, decorateUrl }) => {
    if (session?.currentTask) {
      setFeedback({ error: t("unsupportedVerification") })
      return
    }
    window.location.assign(decorateUrl(returnTo))
  }

  function switchStep(next: Step) {
    setStep(next)
    setFeedback({})
  }

  async function finishSignIn() {
    if (!signIn) return
    switch (signIn.status) {
      case "complete":
        check(await signIn.finalize({ navigate }))
        return
      case "needs_client_trust":
      case "needs_second_factor":
        if (
          signIn.supportedSecondFactors.some(
            (factor) => factor.strategy === "email_code"
          )
        ) {
          setStep("deviceCode")
          check(await signIn.mfa.sendEmailCode())
          return
        }
        if (
          signIn.supportedSecondFactors.some(
            (factor) => factor.strategy === "totp"
          )
        ) {
          setStep("totp")
          return
        }
        if (
          signIn.supportedSecondFactors.some(
            (factor) => factor.strategy === "backup_code"
          )
        ) {
          setStep("backup")
          return
        }
        break
      case "needs_new_password":
        setStep("newPassword")
        return
    }
    setFeedback({ error: t("unsupportedVerification") })
  }

  async function finishSignUp() {
    if (!signUp) return
    if (signUp.status === "complete") {
      check(await signUp.finalize({ navigate }))
    } else if (
      signUp.unverifiedFields.includes("email_address") &&
      signUp.missingFields.length === 0
    ) {
      setStep("signUpCode")
      check(await signUp.verifications.sendEmailCode())
    } else {
      setFeedback({ error: t("registrationError") })
    }
  }

  async function run(operation: () => Promise<void>, errorMessage: string) {
    if (pending) return
    setPending(true)
    setFeedback({})
    try {
      await operation()
    } catch {
      setFeedback({ error: errorMessage })
    } finally {
      setPending(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!signIn || !signUp) return
    const fields = new FormData(event.currentTarget)
    const address = String(fields.get("email") ?? email).trim()
    const password = String(fields.get("password") ?? "")
    const code = String(fields.get("code") ?? "").trim()
    setEmail(address)

    void run(
      async () => {
        switch (step) {
          case "signUp": {
            const firstName = String(fields.get("firstName") ?? "").trim()
            const lastName = String(fields.get("lastName") ?? "").trim()
            check(
              await signUp.password({
                emailAddress: address,
                password,
                firstName: firstName || undefined,
                lastName: lastName || undefined,
              })
            )
            await finishSignUp()
            return
          }
          case "signUpCode":
            check(await signUp.verifications.verifyEmailCode({ code }))
            if (signUp.status !== "complete") throw new Error()
            await finishSignUp()
            return
          case "email":
            check(await signIn.emailCode.sendCode({ emailAddress: address }))
            setStep("signInCode")
            return
          case "forgot":
            check(await signIn.create({ identifier: address }))
            check(await signIn.resetPasswordEmailCode.sendCode())
            setStep("resetCode")
            return
          case "password":
            check(await signIn.password({ emailAddress: address, password }))
            break
          case "signInCode":
            check(await signIn.emailCode.verifyCode({ code }))
            break
          case "deviceCode":
            check(await signIn.mfa.verifyEmailCode({ code }))
            break
          case "totp":
            check(await signIn.mfa.verifyTOTP({ code }))
            break
          case "backup":
            check(await signIn.mfa.verifyBackupCode({ code }))
            break
          case "resetCode":
            check(await signIn.resetPasswordEmailCode.verifyCode({ code }))
            if (signIn.status !== "needs_new_password") throw new Error()
            setStep("newPassword")
            return
          case "newPassword":
            check(
              await signIn.resetPasswordEmailCode.submitPassword({
                password,
                signOutOfOtherSessions: true,
              })
            )
            break
        }
        await finishSignIn()
      },
      codeStep
        ? t("codeError")
        : step === "signUp"
          ? t("registrationError")
          : step === "newPassword"
            ? t("passwordError")
            : step === "password"
              ? t("credentialsError")
              : t("sendCodeError")
    )
  }

  function resend() {
    if (!signIn || !signUp) return
    void run(async () => {
      if (step === "signUpCode")
        check(await signUp.verifications.sendEmailCode())
      else if (step === "deviceCode") check(await signIn.mfa.sendEmailCode())
      else if (step === "resetCode")
        check(await signIn.resetPasswordEmailCode.sendCode())
      else check(await signIn.emailCode.sendCode())
      setFeedback({ notice: t("codeSent") })
    }, t("sendCodeError"))
  }

  function restart() {
    void run(async () => {
      if (signUpPage && signUp) check(await signUp.reset())
      if (!signUpPage && signIn) check(await signIn.reset())
      switchStep(initialStep)
    }, t("tryAgain"))
  }

  const disabled = !loaded || !signIn || !signUp || pending
  return {
    codeStep,
    disabled,
    email,
    error,
    notice,
    initialStep,
    step,
    signedIn: session?.status === "active",
    canUseBackup:
      step === "totp" &&
      signIn?.supportedSecondFactors.some(
        (factor) => factor.strategy === "backup_code"
      ),
    setEmail,
    submit,
    resend,
    restart,
    switchStep,
  }
}
