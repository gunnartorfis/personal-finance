"use client"

import { Loader2, RefreshCw, Sparkles } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Accumulated `POST /api/classify` (DrainResult) counts across the batches drained this run. */
interface ClassifyTotals {
  classified: number
  failed: number
  capped: number
}

/** Safety bound on the drain loop (BATCH=25 server-side → 25k rows) in case a batch never settles. */
const MAX_BATCHES = 1000

/**
 * Trigger classification of the Household's pending transactions (ADR-0005). `POST /api/classify`
 * drains one batch per call, so this re-posts until a batch makes no further progress (queue empty
 * or fully paused by the Free cap), accumulating the counts. Use `autoRun` to fire once on mount —
 * e.g. right after an upload — or leave it off for a manual "Classify pending" button.
 *
 * When `failedCount > 0` a "Retry failed" button requeues prior failures (`POST /api/classify/retry`
 * flips `failed → pending`) and then runs the same drain — the only way back from a `failed` row,
 * e.g. after AI Gateway credits are topped up following a 403.
 */
export function ClassifyTrigger({
  autoRun = false,
  failedCount = 0,
  className,
}: {
  autoRun?: boolean
  failedCount?: number
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [totals, setTotals] = useState<ClassifyTotals | null>(null)
  const [errored, setErrored] = useState(false)
  // Aborts the in-flight drain so an unmount (navigation, or UploadForm dropping uploadId) stops
  // firing further LLM batches instead of running on in the background.
  const abortRef = useRef<AbortController | null>(null)

  const classify = useCallback(async () => {
    abortRef.current?.abort() // cancel any prior run before starting a fresh one
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setErrored(false)
    setTotals(null)
    const run: ClassifyTotals = { classified: 0, failed: 0, capped: 0 }
    try {
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const res = await fetch("/api/classify", { method: "POST", signal: controller.signal })
        if (!res.ok) throw new Error("classify failed")
        const result = (await res.json()) as ClassifyTotals
        run.classified += result.classified
        run.failed += result.failed
        run.capped = result.capped // latest pass reflects rows still paused by the cap
        setTotals({ ...run })
        // A batch that classified nothing new means the queue is drained or fully capped.
        if (result.classified === 0 && result.failed === 0) break
      }
    } catch {
      if (controller.signal.aborted) return // intentional cancel, not a failure
      setErrored(true)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }, [])

  // Requeue prior failures, then drain them. The reset POST is quick (a status flip, no model
  // calls). It gets its own AbortController via abortRef — same as the drain — so an unmount during
  // the reset window cancels it; the subsequent classify() then owns busy/totals/error for the drain.
  const retryFailed = useCallback(async () => {
    abortRef.current?.abort() // cancel any prior run before starting a fresh one
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setErrored(false)
    setTotals(null) // clear any prior run's totals so they don't linger during the reset POST
    try {
      const res = await fetch("/api/classify/retry", { method: "POST", signal: controller.signal })
      if (!res.ok) throw new Error("retry failed")
    } catch {
      if (controller.signal.aborted) return // intentional cancel, not a failure
      setErrored(true)
      setBusy(false)
      return
    }
    await classify()
  }, [classify])

  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRun && !autoRan.current) {
      autoRan.current = true
      void classify()
    }
    return () => abortRef.current?.abort()
  }, [autoRun, classify])

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void classify()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {busy ? "Classifying…" : "Classify pending"}
        </Button>

        {failedCount > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void retryFailed()}
            disabled={busy}
          >
            <RefreshCw />
            {`Retry ${failedCount} failed`}
          </Button>
        )}
      </div>

      {errored && (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t classify — try again.
        </p>
      )}

      {totals && !errored && (
        <p className="text-sm text-muted-foreground">
          {totals.classified} classified
          {totals.failed > 0 && `, ${totals.failed} failed`}.
          {totals.capped > 0 && " Some transactions are paused by your Free plan limit."}
        </p>
      )}
    </div>
  )
}
