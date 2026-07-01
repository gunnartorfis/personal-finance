"use client"

import { CircleAlert, Loader2 } from "lucide-react"
import { useState } from "react"

import { PremiumCheckout } from "@/components/premium-checkout"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function formatRenewal(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(iso),
  )
}

/**
 * Manage the current Household's subscription (ADR-0006). Premium shows the period + renewal date
 * and a Cancel action (`POST /api/billing/cancel`, which downgrades to Free and stops the renewal
 * cron); Free shows the plan. Prop-driven so it renders on the server-loaded page and is easy to
 * test; after a successful cancel it reflects Free locally.
 */
export function ManageSubscription({
  plan,
  planRenewsAt,
  period,
  className,
}: {
  plan: string
  planRenewsAt: string | null
  period: string | null
  className?: string
}) {
  const [cancelled, setCancelled] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)

  async function cancel() {
    setBusy(true)
    setErrored(false)
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" })
      if (!res.ok) throw new Error(`cancel ${res.status}`)
      setCancelled(true)
    } catch {
      setErrored(true)
    } finally {
      setBusy(false)
    }
  }

  const isPremium = plan === "Premium" && !cancelled

  return (
    <section
      aria-label="Subscription"
      className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}
    >
      <h2 className="text-base font-medium">Subscription</h2>

      {isPremium ? (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">Premium</span>
              {period && (
                <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
                  {period}
                </span>
              )}
            </div>
            {planRenewsAt && (
              <p className="text-sm text-muted-foreground">Renews {formatRenewal(planRenewsAt)}.</p>
            )}
          </div>

          {confirming ? (
            // Two-step confirm: cancelling is destructive, so the POST only fires on explicit confirm.
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Cancel your Premium subscription?</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void cancel()}
                disabled={busy}
              >
                {busy && <Loader2 className="animate-spin" />}
                Yes, cancel
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Keep it
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => setConfirming(true)}
            >
              Cancel subscription
            </Button>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold">Free</span>
            <p className="text-sm text-muted-foreground">
              {cancelled
                ? "Your subscription is cancelled — you’re on the Free plan."
                : "You’re on the Free plan."}
            </p>
          </div>
          <PremiumCheckout />
        </>
      )}

      {errored && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>Couldn’t cancel — please try again.</p>
        </div>
      )}
    </section>
  )
}
