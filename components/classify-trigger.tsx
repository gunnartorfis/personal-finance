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
  pendingCount,
  retryOnly = false,
  className,
}: {
  autoRun?: boolean
  failedCount?: number
  /**
   * The backlog this run will drain, used as the progress bar's baseline (see {@link ClassifyTotals}).
   * Server-rendered / status-polled by the parent, so it's fresh after a reload — which is what makes
   * the progress survive a refresh: the drain loop is browser-driven and stops on reload, but the
   * remaining count re-appears here so the user can pick up where it left off. Omit to render no bar.
   */
  pendingCount?: number
  /** Hide the "Classify pending" button and show only the "Retry failed" affordance. */
  retryOnly?: boolean
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

  // Progress-bar baseline: the pending backlog for a normal drain, or the failure count for a
  // retry-only control. `settled` rows (classified or failed) leave the queue, so they fill the bar;
  // capped rows stay pending and legitimately leave it short of 100%.
  const baseline = pendingCount ?? (retryOnly ? failedCount : undefined)
  const settled = totals ? totals.classified + totals.failed : 0
  const percent =
    baseline && baseline > 0 ? Math.min(100, Math.round((settled / baseline) * 100)) : 0
  const complete = !busy && totals !== null && !errored
  const showProgress = baseline !== undefined && baseline > 0 && (busy || complete)

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap gap-2">
        {!retryOnly && (
          <Button type="button" onClick={() => void classify()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy
              ? "Classifying…"
              : pendingCount !== undefined
                ? `Classify pending (${pendingCount})`
                : "Classify pending"}
          </Button>
        )}

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

      {showProgress && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {busy ? `Classifying… ${settled} of ${baseline}` : "Classification complete"}
            </span>
            <span className="font-medium tabular-nums">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Classification progress"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full bg-primary transition-all",
                complete && percent === 100 && "bg-emerald-500",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

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
