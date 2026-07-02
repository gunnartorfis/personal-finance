"use client"

import { CircleAlert, Loader2, MailCheck, RefreshCw } from "lucide-react"
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
  const [resend, setResend] = useState<ResendState>("idle")
  const [continuing, setContinuing] = useState(false)

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
    await authClient.signOut()
    window.location.assign("/auth/sign-in")
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="flex flex-col gap-4">
        <MailCheck aria-hidden="true" className="size-6 shrink-0 text-primary" />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Verify your email to join
          </h1>
          <p className="max-w-[60ch] text-pretty text-muted-foreground">
            You’ve been invited to share a household’s combined finances. Because that includes
            everyone’s money, we need to confirm you own{" "}
            <strong className="font-medium text-foreground">{email}</strong> before you can see it.
            Open the verification link we emailed you, then continue.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Already clicked the link?</p>
          <p className="text-sm text-pretty text-muted-foreground">
            Continue to accept your invitation and open the shared household.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={handleContinue} disabled={continuing} className="self-start">
            {continuing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            I’ve verified my email
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResend}
            disabled={resend === "sending" || resend === "sent"}
          >
            {resend === "sending" ? <Loader2 className="animate-spin" /> : null}
            {RESEND_LABEL[resend]}
          </Button>
        </div>
        {resend === "error" && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p className="text-pretty">
              Couldn’t send a new email. Use the link from your original invitation email, or try
              again shortly.
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleSwitchAccount}
        className="self-start text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Not you? Sign in with a different account
      </button>
    </main>
  )
}

const RESEND_LABEL: Record<ResendState, string> = {
  idle: "Resend verification email",
  sending: "Sending…",
  sent: "Sent — check your inbox",
  error: "Resend verification email",
}
