"use client"

import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { cn } from "@/lib/utils"

/**
 * The Member's Digest opt-in/out toggle on the account settings page (#102, ADR-0019). Persists via
 * `PUT /api/settings/digest` (scoped server-side to the current Member) and refreshes. Optimistic:
 * flips immediately and reverts if the request fails, so a best-effort preference never throws to an
 * error boundary. Mirrors the locale switcher's transition/refresh pattern.
 */
export function DigestPreferenceToggle({ subscribed }: { subscribed: boolean }) {
  const t = useTranslations("digest")
  const router = useRouter()
  const [on, setOn] = useState(subscribed)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    startTransition(async () => {
      try {
        const res = await fetch("/api/settings/digest", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subscribed: next }),
        })
        if (res.ok) router.refresh()
        else setOn(!next) // persist failed — revert to the real state
      } catch {
        setOn(!next) // network failure — revert; must be caught (React 19 transition → error boundary)
      }
    })
  }

  return (
    <section className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{t("settings.title")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("settings.description")}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t("settings.title")}
        disabled={pending}
        onClick={toggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          on ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
            on ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </section>
  )
}
