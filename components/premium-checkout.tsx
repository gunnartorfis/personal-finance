"use client"

import { CircleAlert, Loader2, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import "@adyen/adyen-web/styles/adyen.css"

import { Button } from "@/components/ui/button"
import { type BillingPeriod, subscriptionPriceISK } from "@/lib/billing/pricing"
import { cn } from "@/lib/utils"

/** The subset of the checkout-session response the Drop-in needs (see /api/billing/checkout). */
interface CheckoutSession {
  id: string
  sessionData: string
  clientKey: string
}

type Phase = "choose" | "paying" | "confirming" | "submitted" | "done"

/** Activation is webhook-driven, so after an authorised payment we poll the plan until it flips. */
const POLL_INTERVAL_MS = 1500
const MAX_CONFIRM_POLLS = 10

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
export function PremiumCheckout({
  className,
  pollIntervalMs = POLL_INTERVAL_MS,
  maxPolls = MAX_CONFIRM_POLLS,
}: {
  className?: string
  /** Activation-poll cadence; overridable so tests can exercise the loop without long waits. */
  pollIntervalMs?: number
  maxPolls?: number
}) {
  const router = useRouter()
  const [period, setPeriod] = useState<BillingPeriod>("monthly")
  const [phase, setPhase] = useState<Phase>("choose")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // The mounted Drop-in, kept so we can tear it down (release Adyen's listeners/timers) on unmount.
  const dropinRef = useRef<{ unmount: () => void } | null>(null)
  // Cancel the activation poll on unmount so it doesn't keep fetching / setState after teardown.
  const cancelledRef = useRef(false)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      dropinRef.current?.unmount()
    }
  }, [])

  // Poll the household plan until the Authorization webhook has activated Premium, then show it as
  // active. If it hasn't landed within the window, fall back to the "submitted" reassurance.
  async function confirmActivation() {
    setPhase("confirming")
    for (let attempt = 0; attempt < maxPolls; attempt++) {
      if (cancelledRef.current) return
      try {
        const res = await fetch("/api/billing/status")
        if (res.ok) {
          const { plan } = (await res.json()) as { plan: string }
          if (plan === "Premium") {
            if (!cancelledRef.current) {
              setPhase("done")
              // The surrounding plan UI (ManageSubscription) was server-rendered as Free; re-fetch it
              // so it swaps to the Premium view without the user having to reload the page.
              router.refresh()
            }
            return
          }
        }
      } catch {
        // transient — keep polling
      }
      if (cancelledRef.current) return
      if (attempt < maxPolls - 1) {
        // No need to wait after the final attempt — we're about to give up below.
        await new Promise<void>((resolve) => {
          pollTimerRef.current = setTimeout(resolve, pollIntervalMs)
        })
      }
    }
    if (!cancelledRef.current) setPhase("submitted")
  }

  async function mountDropin(session: CheckoutSession) {
    // Dynamically imported so the heavy SDK stays out of the initial bundle and never evaluates
    // during SSR (it touches `window` at module scope).
    const { AdyenCheckout, Dropin, Card } = await import("@adyen/adyen-web")
    const checkout = await AdyenCheckout({
      environment: session.clientKey.startsWith("live") ? "live" : "test",
      clientKey: session.clientKey,
      session: { id: session.id, sessionData: session.sessionData },
      // `onPaymentCompleted` fires for final-or-actionable codes, not only Authorised — async
      // methods (SEPA/iDEAL) return Pending/Received and clear later via the webhook, so only claim
      // Premium is active for an outright Authorised. Tear the Drop-in down first: the phase change
      // removes its container from the DOM, so release Adyen's listeners/timers before that.
      onPaymentCompleted: (result) => {
        dropinRef.current?.unmount()
        dropinRef.current = null
        setError(null) // clear any prior failure so a successful retry doesn't show a stale alert
        if (result.resultCode === "Authorised") {
          void confirmActivation() // verify the webhook activated Premium before claiming it
        } else {
          setPhase("submitted")
        }
      },
      onPaymentFailed: () => setError("Payment wasn’t completed. Please try again."),
      onError: () => setError("Something went wrong with the payment. Please try again."),
    })
    if (containerRef.current) {
      // v6 no longer auto-bundles payment methods: each supported method must be registered via
      // `paymentMethodComponents` or the Drop-in renders an empty list (silent, bar a console.warn).
      // Card is the only method for this ISK subscription.
      dropinRef.current = new Dropin(checkout, { paymentMethodComponents: [Card] }).mount(
        containerRef.current,
      )
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
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-500">
          Premium is active — thanks for subscribing!
        </p>
      ) : phase === "confirming" ? (
        <p className="text-sm text-muted-foreground">Confirming your payment…</p>
      ) : phase === "submitted" ? (
        <p className="text-sm text-muted-foreground">
          Payment submitted — we’ll activate your plan once it’s confirmed.
        </p>
      ) : (
        <>
          {phase === "choose" && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="billing-period" className="text-sm font-medium">
                  Billing period
                </label>
                <div className="grid grid-cols-[1fr_--spacing(7)] items-center rounded-md border border-input bg-input/20 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30">
                  <select
                    id="billing-period"
                    value={period}
                    onChange={(event) => setPeriod(event.target.value as BillingPeriod)}
                    className="col-span-full row-start-1 h-7 appearance-none bg-transparent py-0.5 pr-7 pl-2 text-sm outline-none"
                  >
                    {(Object.keys(PERIOD_LABELS) as BillingPeriod[]).map((value) => (
                      <option key={value} value={value}>
                        {PERIOD_LABELS[value]} — {priceLabel(value)}
                      </option>
                    ))}
                  </select>
                  <svg
                    viewBox="0 0 8 5"
                    width="8"
                    height="5"
                    fill="none"
                    aria-hidden="true"
                    className="pointer-events-none col-start-2 row-start-1 place-self-center text-muted-foreground"
                  >
                    <path d="M.5.5 4 4 7.5.5" stroke="currentColor" />
                  </svg>
                </div>
              </div>
              <Button type="button" onClick={() => void startCheckout()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {busy ? "Starting…" : "Upgrade to Premium"}
              </Button>
            </div>
          )}
          {/* Always in the DOM so the ref is available to mount the Drop-in into; shown once paying. */}
          <div ref={containerRef} className={cn(phase !== "paying" && "hidden")} />
        </>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </section>
  )
}
