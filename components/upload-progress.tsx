"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

/** Shape returned by `GET /api/uploads/:id/progress`. */
export interface UploadProgressData {
  total: number
  pending: number
  classified: number
  failed: number
  done: boolean
}

/** Poll interval while classification is still in progress. */
const POLL_MS = 1500

/**
 * Live classification progress for an upload (ADR-0005). Polls the progress endpoint until no rows
 * remain pending (`done`), rendering a bar plus a status line. On a transient error it keeps
 * retrying at the same cadence rather than giving up.
 */
export function UploadProgress({
  uploadId,
  className,
}: {
  uploadId: string
  className?: string
}) {
  const [data, setData] = useState<UploadProgressData | null>(null)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      try {
        const res = await fetch(`/api/uploads/${uploadId}/progress`)
        if (!res.ok) throw new Error(`progress ${res.status}`)
        const next = (await res.json()) as UploadProgressData
        if (!active) return
        setData(next)
        setErrored(false)
        if (!next.done) timer = setTimeout(poll, POLL_MS)
      } catch {
        if (!active) return
        setErrored(true)
        timer = setTimeout(poll, POLL_MS)
      }
    }

    void poll()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [uploadId])

  const total = data?.total ?? 0
  const settled = data ? data.classified + data.failed : 0
  const percent = total === 0 ? 0 : Math.round((settled / total) * 100)

  const label = errored
    ? "Couldn’t load progress — retrying…"
    : data?.done
      ? "Classification complete"
      : "Classifying…"

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full bg-primary transition-all",
            data?.done && "bg-emerald-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
