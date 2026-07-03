"use client"

import { CheckCircle2, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

type Status = "idle" | "syncing" | "done" | "error"

/**
 * On-link initial sync (#146). The connect flow redirects back to /accounts?bank=connected; instead
 * of making the user wait for the next daily cron, this fires a one-shot POST /api/open-banking/sync
 * (session-authed, own household) to pull the freshly-linked bank's transactions immediately, shows
 * progress, then strips the param and re-renders the server component with the result. Fires exactly
 * once per landing (a ref guards React's double-invoke); the sync is idempotent so a manual refresh
 * that re-triggers it is harmless. Renders nothing unless the household just connected.
 */
export function InitialSyncOnConnect() {
  const t = useTranslations("bankSync.sync")
  const router = useRouter()
  const params = useSearchParams()
  const justConnected = params.get("bank") === "connected"
  const [status, setStatus] = useState<Status>(
    justConnected ? "syncing" : "idle"
  )
  const [inserted, setInserted] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (!justConnected || started.current) return
    started.current = true
    const controller = new AbortController()
    async function run() {
      try {
        const res = await fetch("/api/open-banking/sync", {
          method: "POST",
          signal: controller.signal,
        })
        if (!res.ok) throw new Error("sync failed")
        const data = (await res.json()) as { inserted: number; failed: number }
        // A connection-level failure comes back as HTTP 200 with `failed > 0` (the server flags the
        // connection `error` and keeps the batch going). On a fresh link that's the whole story —
        // surface it rather than the no-new-transactions success message.
        if (data.failed > 0) {
          setStatus("error")
          return
        }
        setInserted(data.inserted)
        setStatus("done")
        // Drop the one-shot param and re-render the server component with the synced state.
        router.replace("/accounts", { scroll: false })
        router.refresh()
      } catch {
        // Navigating away aborts the fetch — the sync is idempotent and the daily cron finishes any
        // interrupted backfill, so a cancelled request needs no error surfaced.
        if (!controller.signal.aborted) setStatus("error")
      }
    }
    void run()
    return () => {
      controller.abort()
    }
  }, [justConnected, router])

  if (status === "syncing") {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" />
        {t("importing")}
      </p>
    )
  }

  if (status === "done") {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
      >
        <CheckCircle2 className="size-4 text-emerald-500" />
        {t("done", { count: inserted })}
      </p>
    )
  }

  if (status === "error") {
    return (
      <p
        role="alert"
        className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive"
      >
        {t("error")}
      </p>
    )
  }

  return null
}
