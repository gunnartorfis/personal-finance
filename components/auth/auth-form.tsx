"use client"

import { CircleAlert, PiggyBank } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useAuthFlow } from "./use-auth-flow"

export function AuthForm({
  signUpPage = false,
  returnTo,
}: {
  signUpPage?: boolean
  returnTo: string
}) {
  const t = useTranslations("auth")
  const app = useTranslations("common")
  const {
    codeStep,
    disabled,
    email,
    error,
    notice,
    initialStep,
    step,
    signedIn,
    canUseBackup,
    setEmail,
    submit,
    resend,
    restart,
    switchStep,
  } = useAuthFlow({ signUpPage, returnTo })

  const emailCode = codeStep && step !== "totp" && step !== "backup"
  const passwordField =
    step === "password" || step === "signUp" || step === "newPassword"
  const title = codeStep
    ? t("verify")
    : step === "signUp"
      ? t("createAccount")
      : step === "forgot" || step === "newPassword"
        ? t("resetPassword")
        : t("signIn")

  const anotherPage = signUpPage ? "/auth/sign-in" : "/auth/sign-up"

  return (
    <section className="flex w-full max-w-md flex-col gap-6 rounded-xl border border-border bg-card p-6 sm:p-8">
      <Link
        href="/"
        className="flex w-fit items-center gap-2 text-sm font-medium"
      >
        <PiggyBank className="size-5 text-primary" aria-hidden="true" />
        {app("appName")}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {signedIn ? t("signedIn") : title}
        </h1>
        {emailCode && (
          <p className="text-sm break-words text-muted-foreground">
            {t("checkEmail", { email })}
          </p>
        )}
      </header>
      {signedIn ? (
        <Button render={<Link href={returnTo} />}>{t("continue")}</Button>
      ) : (
        <>
          <form key={step} onSubmit={submit} className="flex flex-col gap-4">
            {step === "signUp" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t("firstName")}
                  <Input
                    name="firstName"
                    autoComplete="given-name"
                    className="h-10 text-base pointer-fine:text-sm"
                    disabled={disabled}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t("lastName")}
                  <Input
                    name="lastName"
                    autoComplete="family-name"
                    className="h-10 text-base pointer-fine:text-sm"
                    disabled={disabled}
                  />
                </label>
              </div>
            )}
            {!codeStep && step !== "newPassword" && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("email")}
                <Input
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  required
                  disabled={disabled}
                  className="h-10 text-base pointer-fine:text-sm"
                />
              </label>
            )}
            {passwordField && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {step === "newPassword" ? t("newPassword") : t("password")}
                <Input
                  name="password"
                  type="password"
                  autoComplete={
                    step === "password" ? "current-password" : "new-password"
                  }
                  required
                  disabled={disabled}
                  className="h-10 text-base pointer-fine:text-sm"
                />
              </label>
            )}
            {codeStep && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {step === "totp"
                  ? t("authenticatorCode")
                  : step === "backup"
                    ? t("backupCode")
                    : t("code")}
                <Input
                  name="code"
                  autoComplete="one-time-code"
                  inputMode={step === "backup" ? "text" : "numeric"}
                  required
                  disabled={disabled}
                  className="h-10 text-base pointer-fine:text-sm"
                />
              </label>
            )}
            {error && (
              <p role="alert" className="flex gap-2 text-sm text-destructive">
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-muted-foreground">
                {notice}
              </p>
            )}
            <Button type="submit" disabled={disabled} className="h-10">
              {disabled
                ? t("working")
                : codeStep
                  ? t("verify")
                  : step === "forgot" || step === "email"
                    ? t("sendCode")
                    : title}
            </Button>
          </form>
          {step === "password" && (
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => switchStep("email")}
              >
                {t("useEmailCode")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => switchStep("forgot")}
              >
                {t("forgotPassword")}
              </Button>
            </div>
          )}
          {step !== initialStep && (
            <div className="flex flex-wrap gap-2">
              {emailCode && (
                <Button variant="outline" disabled={disabled} onClick={resend}>
                  {t("resendCode")}
                </Button>
              )}
              {step === "totp" && canUseBackup && (
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => switchStep("backup")}
                >
                  {t("useBackupCode")}
                </Button>
              )}
              <Button variant="ghost" disabled={disabled} onClick={restart}>
                {t("startOver")}
              </Button>
            </div>
          )}
          <p className="border-t border-border pt-5 text-sm text-muted-foreground">
            {signUpPage ? t("haveAccount") : t("needAccount")}{" "}
            <Link
              href={{
                pathname: anotherPage,
                query: { redirect_url: returnTo },
              }}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {signUpPage ? t("signIn") : t("createAccount")}
            </Link>
          </p>
        </>
      )}
    </section>
  )
}
