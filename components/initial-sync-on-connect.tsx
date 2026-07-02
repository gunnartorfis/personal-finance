"use client"

import { CheckCircle2, Loader2 } from "lucide-react"
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
  const router = useRouter()
  const params = useSearchParams()
  const justConnected = params.get("bank") === "connected"
  const [status, setStatus] = useState<Status>(justConnected ? "syncing" : "idle")
  const [inserted, setInserted] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (!justConnected || started.current) return
    started.current = true
    let cancelled = false
    async function run() {
      try {
        const res = await fetch("/api/open-banking/sync", { method: "POST" })
        if (!res.ok) throw new Error("sync failed")
        const data = (await res.json()) as { inserted: number; failed: number }
        if (cancelled) return
        setInserted(data.inserted)
        setStatus("done")
        // Drop the one-shot param and re-render the server component with the synced state.
        router.replace("/accounts", { scroll: false })
        router.refresh()
      } catch {
        if (!cancelled) setStatus("error")
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [justConnected, router])

  if (status === "syncing") {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" />
        Importing your transactions…
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
        {inserted > 0
          ? `Imported ${inserted.toLocaleString()} transaction${inserted === 1 ? "" : "s"}.`
          : "Your bank is connected — no new transactions to import yet."}
      </p>
    )
  }

  if (status === "error") {
    return (
      <p
        role="alert"
        className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive"
      >
        Your bank is connected, but we couldn&apos;t import transactions just now — they&apos;ll
        appear after the next sync.
      </p>
    )
  }

  return null
}
