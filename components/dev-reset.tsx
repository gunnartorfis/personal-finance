"use client"

import { CircleAlert, Loader2, Trash2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * DEVELOPER TOOL (staging only): a "Danger zone" that wipes the current Household's financial data
 * via `POST /api/dev/reset`. Only mounted when `isDevResetEnabled()` is true on the server, so it is
 * never present in production. Uses a two-step confirm (the destructive button reveals an explicit
 * confirm/cancel) rather than a native prompt, and hard-reloads to the dashboard on success so every
 * cached view reflects the empty state.
 */
export function DevReset({ className }: { className?: string }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)

  async function reset() {
    setBusy(true)
    setErrored(false)
    try {
      const res = await fetch("/api/dev/reset", { method: "POST" })
      if (!res.ok) {
        setErrored(true)
        return
      }
      // Full reload so server components re-fetch the now-empty dataset.
      window.location.assign("/")
    } catch {
      setErrored(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-label="Danger zone"
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-destructive">Danger zone (staging)</h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Delete <strong>all</strong> uploads, transactions, overrides, accounts, and merchant rules
          for your household. Your account and plan are kept. This cannot be undone.
        </p>
      </div>

      {errored && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>Couldn’t reset the data. Please try again.</p>
        </div>
      )}

      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Delete everything? This can’t be undone.</span>
          <Button variant="destructive" onClick={reset} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Yes, reset my data
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="destructive"
          className="self-start"
          onClick={() => setConfirming(true)}
        >
          <Trash2 />
          Reset transaction data
        </Button>
      )}
    </section>
  )
}
