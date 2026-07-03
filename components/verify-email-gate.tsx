"use client"

import { CircleAlert, Loader2, MailCheck, RefreshCw } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth/client"

type ResendState = "idle" | "sending" | "sent" | "error"

/**
 * Full-screen gate shown to an invited user who has signed in but not yet verified their email
 * (ADR-0010). Until the address is confirmed we can't safely add them to the inviter's Household, so
 * the tenant guard routes them here instead of auto-provisioning a stray empty Household (which is
 * what produced the "blank data" state). Offers a resend, a re-check, and an escape hatch to sign in
 * with a different account.
 */
export function VerifyEmailGate({ email }: { email: string }) {
  const t = useTranslations("join.verify")
  const [resend, setResend] = useState<ResendState>("idle")
  const [continuing, setContinuing] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchFailed, setSwitchFailed] = useState(false)

  async function handleResend() {
    setResend("sending")
    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/join",
      })
      setResend(error ? "error" : "sent")
    } catch {
      setResend("error")
    }
  }

  function handleContinue() {
    setContinuing(true)
    // Hard-navigate so the tenant guard re-reads the (hopefully now verified) session server-side.
    window.location.assign("/join")
  }

  async function handleSwitchAccount() {
    if (switching) return
    setSwitching(true)
    setSwitchFailed(false)
    try {
      const { error } = await authClient.signOut()
      if (error) {
        setSwitchFailed(true)
        setSwitching(false)
        return
      }
      window.location.assign("/auth/sign-in")
    } catch {
      setSwitchFailed(true)
      setSwitching(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="flex flex-col gap-4">
        <MailCheck aria-hidden="true" className="size-6 shrink-0 text-primary" />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("title")}</h1>
          <p className="max-w-[60ch] text-pretty text-muted-foreground">
            {t.rich("body", {
              email,
              strong: (chunks) => (
                <strong className="font-medium text-foreground">{chunks}</strong>
              ),
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t("alreadyClicked")}</p>
          <p className="text-sm text-pretty text-muted-foreground">{t("continueBlurb")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={handleContinue} disabled={continuing} className="self-start">
            {continuing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t("continue")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResend}
            disabled={resend === "sending" || resend === "sent"}
          >
            {resend === "sending" ? <Loader2 className="animate-spin" /> : null}
            {resend === "sending"
              ? t("resend.sending")
              : resend === "sent"
                ? t("resend.sent")
                : t("resend.idle")}
          </Button>
        </div>
        {resend === "error" && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p className="text-pretty">{t("resendError")}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={handleSwitchAccount}
          disabled={switching}
          className="self-start text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
        >
          {switching ? t("switching") : t("switch")}
        </button>
        {switchFailed && (
          <p role="alert" className="text-sm text-pretty text-destructive">
            {t("switchError")}
          </p>
        )}
      </div>
    </main>
  )
}
