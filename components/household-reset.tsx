"use client"

import { CircleAlert, Loader2, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Destructive "Danger zone" that wipes the current Household's financial data via
 * `POST /api/household/reset`. Only mounted when `isHouseholdResetEnabled()` is true on the server,
 * so it is absent wherever `ENABLE_HOUSEHOLD_RESET` is unset. Uses a two-step confirm (the
 * destructive button reveals an explicit confirm/cancel) rather than a native prompt, and
 * hard-reloads to the dashboard on success so every cached view reflects the empty state.
 */
export function HouseholdReset({ className }: { className?: string }) {
  const t = useTranslations("householdReset")
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)

  async function reset() {
    setBusy(true)
    setErrored(false)
    try {
      const res = await fetch("/api/household/reset", { method: "POST" })
      if (!res.ok) {
        setErrored(true)
        setBusy(false)
        return
      }
      // Full reload so server components re-fetch the now-empty dataset. Keep the spinner up —
      // the page is navigating away, so clearing `busy` here would only flash the button back.
      window.location.assign("/")
    } catch {
      setErrored(true)
      setBusy(false)
    }
  }

  return (
    <section
      aria-label={t("dangerZone")}
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-destructive">{t("dangerZone")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">
          {t.rich("description", { strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      </div>

      {errored && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{t("error")}</p>
        </div>
      )}

      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{t("confirmPrompt")}</span>
          <Button variant="destructive" onClick={reset} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {t("confirm")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setConfirming(false)
              setErrored(false)
            }}
            disabled={busy}
          >
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <Button
          variant="destructive"
          className="self-start"
          onClick={() => setConfirming(true)}
        >
          <Trash2 />
          {t("trigger")}
        </Button>
      )}
    </section>
  )
}
