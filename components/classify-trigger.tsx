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
 * localStorage flag marking a drain the user has started but not yet finished. Because the drain
 * loop is browser-driven, a refresh/navigation aborts it mid-run; the flag survives that, so a
 * `resumable` control re-mounting on the next page load can pick the drain back up (and show its
 * progress bar) instead of silently stalling. It's set when a drain starts and cleared only on a
 * clean finish or a real error — never on an abort — so it persists exactly across a refresh.
 */
const ACTIVE_KEY = "classify:active"

function setDrainActive(active: boolean) {
  try {
    if (active) window.localStorage.setItem(ACTIVE_KEY, "1")
    else window.localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // Private mode / disabled storage: resume-across-refresh degrades to manual, nothing breaks.
  }
}

function isDrainActive(): boolean {
  try {
    return window.localStorage.getItem(ACTIVE_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Trigger classification of the Household's pending transactions (ADR-0005). `POST /api/classify`
 * drains one batch per call, so this re-posts until a batch makes no further progress (queue empty
 * or fully paused by the Free cap), accumulating the counts. Use `autoRun` to fire once on mount —
 * e.g. right after an upload — or leave it off for a manual "Classify pending" button.
 *
 * When `failedCount > 0` a "Retry failed" button requeues prior failures (`POST /api/classify/retry`
 * flips `failed → pending`) and then runs the same drain — the only way back from a `failed` row,
 * e.g. after AI Gateway credits are topped up following a 403.
 *
 * Pass `resumable` for the standing household controls (dashboard / transactions / banner): once the
 * user starts a drain, it auto-resumes on the next page load while pending work remains, so a refresh
 * mid-classification keeps going with its progress bar instead of dropping to a bare button. (Leave it
 * off for the post-upload `autoRun` control, which already has its own per-upload progress.)
 */
export function ClassifyTrigger({
  autoRun = false,
  failedCount = 0,
  pendingCount,
  resumable = false,
  retryOnly = false,
  className,
}: {
  autoRun?: boolean
  failedCount?: number
  /**
   * The backlog this run will drain, used as the progress bar's baseline. Server-rendered by the
   * parent so it's the *remaining* count after a reload — which becomes the fresh baseline the
   * resumed drain fills from 0 → 100%. Omit to render no bar.
   */
  pendingCount?: number
  /** Auto-resume an unfinished drain on mount and persist that intent across a refresh (see above). */
  resumable?: boolean
  /** Hide the "Classify pending" button and show only the "Retry failed" affordance. */
  retryOnly?: boolean
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [totals, setTotals] = useState<ClassifyTotals | null>(null)
  const [errored, setErrored] = useState(false)
  // The progress bar's denominator, snapshotted when a run starts rather than read live from
  // `pendingCount` — a parent that polls (the banner) feeds a *decreasing* count, which would make
  // the bar overshoot as `settled` climbs against a shrinking baseline. `undefined` → no bar yet.
  const [baseline, setBaseline] = useState<number | undefined>(undefined)
  // Aborts the in-flight drain so an unmount (navigation, or UploadForm dropping uploadId) stops
  // firing further LLM batches instead of running on in the background.
  const abortRef = useRef<AbortController | null>(null)
  // Latest baseline source, tracked in a ref so a run can snapshot it without `pendingCount` being an
  // effect/callback dependency — otherwise a polling parent's prop churn would retrigger the mount
  // effect's cleanup and abort the very drain it's meant to keep alive. Synced in an effect (below)
  // rather than during render, and initialised eagerly so the first paint's value is available.
  const baselineSourceRef = useRef<number | undefined>(
    pendingCount ?? (retryOnly ? failedCount : undefined),
  )
  useEffect(() => {
    baselineSourceRef.current = pendingCount ?? (retryOnly ? failedCount : undefined)
  }, [pendingCount, retryOnly, failedCount])

  const classify = useCallback(async () => {
    abortRef.current?.abort() // cancel any prior run before starting a fresh one
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setErrored(false)
    setTotals(null)
    setBaseline(baselineSourceRef.current) // freeze the bar denominator for this run
    // Mark the drain in-flight so a refresh mid-run resumes it (resumable controls only).
    if (resumable) setDrainActive(true)
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
      // Reached only on a clean finish (no throw/abort): the queue is drained or capped, so there's
      // nothing left to resume — clear the flag so a later page load doesn't re-drive on its own.
      if (resumable) setDrainActive(false)
    } catch {
      if (controller.signal.aborted) return // intentional cancel (refresh/nav): keep the flag to resume
      setErrored(true)
      // A real failure isn't worth auto-retrying on every subsequent load — clear and let the user retry.
      if (resumable) setDrainActive(false)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }, [resumable])

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
    if (resumable) setDrainActive(true)
    try {
      const res = await fetch("/api/classify/retry", { method: "POST", signal: controller.signal })
      if (!res.ok) throw new Error("retry failed")
    } catch {
      if (controller.signal.aborted) return // intentional cancel, not a failure
      setErrored(true)
      setBusy(false)
      if (resumable) setDrainActive(false)
      return
    }
    await classify()
  }, [classify, resumable])

  // Fire the drain once per mount when either (a) `autoRun` is set (post-upload), or (b) this is a
  // resumable control whose drain the user started earlier and a refresh interrupted — detected by
  // the persisted flag plus remaining pending work. `pendingCount` is read from a ref, not a
  // dependency, so a polling parent's prop churn can't re-run this and abort the live drain.
  const driveStartedRef = useRef(false)
  useEffect(() => {
    const shouldResume =
      resumable && !retryOnly && (baselineSourceRef.current ?? 0) > 0 && isDrainActive()
    if (!driveStartedRef.current && (autoRun || shouldResume)) {
      driveStartedRef.current = true
      void classify()
    }
    return () => {
      abortRef.current?.abort()
      // Reset the guard so the *next* mount re-drives. This is what makes resume survive React
      // Strict Mode's dev-only mount → cleanup → remount cycle: the cleanup aborts the first drain,
      // and clearing the guard lets the remount start a fresh one instead of leaving it stuck.
      driveStartedRef.current = false
    }
  }, [autoRun, resumable, retryOnly, classify])

  // `settled` rows (classified or failed) leave the queue, so they fill the bar against the frozen
  // baseline; capped rows stay pending and legitimately leave it short of 100%.
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
              {busy
                ? // Clamp the shown count: if new rows land mid-run `settled` can exceed the baseline,
                  // which would otherwise read "12 of 10" against a bar already pinned at 100%.
                  `Classifying… ${Math.min(settled, baseline ?? settled)} of ${baseline}`
                : "Classification complete"}
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
