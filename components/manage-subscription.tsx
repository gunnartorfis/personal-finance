"use client"

import { useState } from "react"

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
    <section className={cn("flex flex-col gap-3 rounded-xl border border-border p-6", className)}>
      <h2 className="text-lg font-medium">Subscription</h2>

      {isPremium ? (
        <>
          <p className="text-sm text-muted-foreground">
            Premium{period ? ` (${period})` : ""}
            {planRenewsAt ? ` — renews ${formatRenewal(planRenewsAt)}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => void cancel()}
            disabled={busy}
            className="self-start rounded-md border border-border px-3 py-1 text-sm font-medium"
          >
            Cancel subscription
          </button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {cancelled
            ? "Your subscription is cancelled — you’re on the Free plan."
            : "You’re on the Free plan."}
        </p>
      )}

      {errored && (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t cancel — please try again.
        </p>
      )}
    </section>
  )
}
