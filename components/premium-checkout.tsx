"use client"

import { useEffect, useRef, useState } from "react"

import "@adyen/adyen-web/styles/adyen.css"

import { type BillingPeriod, subscriptionPriceISK } from "@/lib/billing/pricing"
import { cn } from "@/lib/utils"

/** The subset of the checkout-session response the Drop-in needs (see /api/billing/checkout). */
interface CheckoutSession {
  id: string
  sessionData: string
  clientKey: string
}

type Phase = "choose" | "paying" | "done"

const PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: "Monthly",
  annual: "Annual (save 30%)",
}

const priceLabel = (period: BillingPeriod) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "ISK", maximumFractionDigits: 0 })
    .format(subscriptionPriceISK(period)) + (period === "annual" ? "/yr" : "/mo")

/**
 * Upgrade a Free Household to Premium (ADR-0006). Picks a billing period, opens a Straumur (Adyen
 * Sessions) checkout via `POST /api/billing/checkout`, then mounts the Adyen Web Drop-in with the
 * returned session + clientKey (environment derived from the key prefix). Premium activation itself
 * is webhook-driven; the Drop-in's completion callback just confirms the payment went through.
 */
export function PremiumCheckout({ className }: { className?: string }) {
  const [period, setPeriod] = useState<BillingPeriod>("monthly")
  const [phase, setPhase] = useState<Phase>("choose")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // The mounted Drop-in, kept so we can tear it down (release Adyen's listeners/timers) on unmount.
  const dropinRef = useRef<{ unmount: () => void } | null>(null)

  useEffect(() => () => dropinRef.current?.unmount(), [])

  async function mountDropin(session: CheckoutSession) {
    // Dynamically imported so the heavy SDK stays out of the initial bundle and never evaluates
    // during SSR (it touches `window` at module scope).
    const { AdyenCheckout, Dropin } = await import("@adyen/adyen-web")
    const checkout = await AdyenCheckout({
      environment: session.clientKey.startsWith("live") ? "live" : "test",
      clientKey: session.clientKey,
      session: { id: session.id, sessionData: session.sessionData },
      onPaymentCompleted: () => setPhase("done"),
      onPaymentFailed: () => setError("Payment wasn’t completed. Please try again."),
      onError: () => setError("Something went wrong with the payment. Please try again."),
    })
    if (containerRef.current) {
      dropinRef.current = new Dropin(checkout).mount(containerRef.current)
    }
  }

  async function startCheckout() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      })
      if (!res.ok) throw new Error(`checkout ${res.status}`)
      const session = (await res.json()) as CheckoutSession
      await mountDropin(session)
      setPhase("paying")
    } catch {
      // An Adyen session is single-use, so a session spent on a failed mount is fine to abandon —
      // the retry below re-POSTs /api/billing/checkout for a fresh session.
      setError("Couldn’t start checkout — please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {phase === "done" ? (
        <p className="text-sm font-medium text-emerald-600">
          Premium is active — thanks for subscribing!
        </p>
      ) : (
        <>
          {phase === "choose" && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="billing-period" className="text-sm text-muted-foreground">
                  Billing period
                </label>
                <select
                  id="billing-period"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value as BillingPeriod)}
                  className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
                >
                  {(Object.keys(PERIOD_LABELS) as BillingPeriod[]).map((value) => (
                    <option key={value} value={value}>
                      {PERIOD_LABELS[value]} — {priceLabel(value)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void startCheckout()}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1 text-sm font-medium disabled:opacity-50"
              >
                {busy ? "Starting…" : "Upgrade to Premium"}
              </button>
            </div>
          )}
          {/* Always in the DOM so the ref is available to mount the Drop-in into; shown once paying. */}
          <div ref={containerRef} className={cn(phase !== "paying" && "hidden")} />
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
