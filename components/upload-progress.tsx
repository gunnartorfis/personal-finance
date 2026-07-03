"use client"

import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { RadialProgress } from "@/components/radial-progress"
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
  const t = useTranslations("upload.progress")
  const [data, setData] = useState<UploadProgressData | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      try {
        const res = await fetch(`/api/uploads/${uploadId}/progress`)
        if (!res.ok) {
          // A 4xx (malformed or unknown/other-tenant id) is permanent — retrying never recovers, so
          // stop. Only a 5xx or network failure is transient and worth re-polling.
          if (res.status >= 400 && res.status < 500) {
            if (active) {
              setFailed(true)
              setRetrying(false)
            }
            return
          }
          throw new Error(`progress ${res.status}`)
        }
        const next = (await res.json()) as UploadProgressData
        if (!active) return
        setData(next)
        setRetrying(false)
        if (!next.done) timer = setTimeout(poll, POLL_MS)
      } catch {
        if (!active) return
        setRetrying(true)
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

  const label = failed
    ? t("failed")
    : retrying
      ? t("retrying")
      : data?.done
        ? t("complete")
        : t("classifying")

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <RadialProgress
        percent={percent}
        label={t("label")}
        role="progressbar"
        tone={data?.done ? "success" : "primary"}
        className="size-12"
      />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}
