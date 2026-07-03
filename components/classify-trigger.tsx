"use client"

import { Loader2, RefreshCw, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
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
 * clean finish or a genuine post-retry failure — never on an abort or a page teardown — so it
 * persists exactly across a refresh.
 */
const ACTIVE_KEY = "classify:active"

/**
 * Transient-failure policy for the drain's POSTs. A full drain is dozens of sequential requests
 * over several minutes, so one flaky 5xx or dropped connection must not kill the whole run (and
 * wipe the resume flag with it): each batch gets a few attempts with exponential backoff before
 * the drain gives up for real.
 */
const BATCH_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 300

/** Abort-aware backoff delay: settles early (rejecting) if the drain is cancelled mid-wait. */
function backoff(attempt: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"))
      return
    }
    const timer = setTimeout(
      () => {
        signal.removeEventListener("abort", onAbort)
        resolve()
      },
      RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
    )
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException("aborted", "AbortError"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * `POST url`, retrying transient failures — network drops and 5xx responses — per the policy above.
 * Gives up immediately when the drain was aborted or the page is unloading (retrying inside a dying
 * page is pointless), and never retries a 4xx: those are deterministic, not transient.
 */
async function postWithRetry(
  url: string,
  signal: AbortSignal,
  interrupted: () => boolean
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    // Re-check before every request, not just at the retry decision: if the page began unloading
    // while backoff() was sleeping (its timer isn't tied to `signal`, which stays un-aborted on a
    // refresh), the loop would otherwise dispatch one more POST into the dying page.
    if (signal.aborted || interrupted())
      throw new DOMException("aborted", "AbortError")
    let res: Response
    try {
      res = await fetch(url, { method: "POST", signal })
    } catch (error) {
      if (attempt >= BATCH_ATTEMPTS || signal.aborted || interrupted())
        throw error
      await backoff(attempt, signal)
      continue
    }
    if (res.ok) return res
    if (res.status < 500 || attempt >= BATCH_ATTEMPTS || interrupted()) {
      throw new Error(`classify failed (${res.status})`)
    }
    await backoff(attempt, signal)
  }
}

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
  const t = useTranslations("classify")
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
  // True once the page starts tearing down (refresh / tab close / cross-document nav). React never
  // unmounts on a hard refresh — no cleanup runs, so abortRef never fires — and the browser kills
  // the in-flight classify fetch with a plain network error instead. Without this marker that
  // rejection is indistinguishable from a real drain failure, so the catch below used to clear the
  // resume flag milliseconds before the page died — which is why refresh-resume never fired.
  // pageshow resets it so a bfcache restore doesn't leave the control permanently "unloading".
  const unloadingRef = useRef(false)
  useEffect(() => {
    const mark = () => {
      unloadingRef.current = true
    }
    const clear = () => {
      unloadingRef.current = false
    }
    window.addEventListener("pagehide", mark)
    window.addEventListener("beforeunload", mark)
    window.addEventListener("pageshow", clear)
    return () => {
      window.removeEventListener("pagehide", mark)
      window.removeEventListener("beforeunload", mark)
      window.removeEventListener("pageshow", clear)
    }
  }, [])
  // Latest baseline source, tracked in a ref so a run can snapshot it without `pendingCount` being an
  // effect/callback dependency — otherwise a polling parent's prop churn would retrigger the mount
  // effect's cleanup and abort the very drain it's meant to keep alive. Synced in an effect (below)
  // rather than during render, and initialised eagerly so the first paint's value is available.
  const baselineSourceRef = useRef<number | undefined>(
    pendingCount ?? (retryOnly ? failedCount : undefined)
  )
  useEffect(() => {
    baselineSourceRef.current =
      pendingCount ?? (retryOnly ? failedCount : undefined)
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
        const res = await postWithRetry(
          "/api/classify",
          controller.signal,
          () => unloadingRef.current
        )
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
      // Intentional interruptions keep the flag so the next page load resumes: an unmount abort
      // (client-side nav), or the page unloading — a refresh kills the fetch with a plain network
      // error and never unmounts, so only the pagehide/beforeunload marker identifies it.
      if (controller.signal.aborted || unloadingRef.current) return
      setErrored(true)
      // A drain still failing after per-batch retries isn't worth auto-retrying on every subsequent
      // load — clear and let the user retry.
      if (resumable) setDrainActive(false)
    } finally {
      if (!controller.signal.aborted && !unloadingRef.current) setBusy(false)
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
      const res = await fetch("/api/classify/retry", {
        method: "POST",
        signal: controller.signal,
      })
      if (!res.ok) throw new Error("retry failed")
    } catch {
      // Intentional interruption (unmount abort or page teardown), not a failure — see classify().
      if (controller.signal.aborted || unloadingRef.current) return
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
      resumable &&
      !retryOnly &&
      (baselineSourceRef.current ?? 0) > 0 &&
      isDrainActive()
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
    baseline && baseline > 0
      ? Math.min(100, Math.round((settled / baseline) * 100))
      : 0
  const complete = !busy && totals !== null && !errored
  const showProgress =
    baseline !== undefined && baseline > 0 && (busy || complete)

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap gap-2">
        {!retryOnly && (
          <Button type="button" onClick={() => void classify()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy
              ? t("classifying")
              : pendingCount !== undefined
                ? t("pendingCount", { count: pendingCount })
                : t("pending")}
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
            {t("retryFailed", { count: failedCount })}
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
                  t("progressBusy", {
                    settled: Math.min(settled, baseline ?? settled),
                    total: baseline ?? 0,
                  })
                : t("progressComplete")}
            </span>
            <span className="font-medium tabular-nums">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={t("progressLabel")}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full bg-primary transition-all",
                complete && percent === 100 && "bg-emerald-500"
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {errored && (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}
        </p>
      )}

      {totals && !errored && (
        <p className="text-sm text-muted-foreground">
          {t("resultClassified", { count: totals.classified })}
          {totals.failed > 0 &&
            t("resultFailedSuffix", { count: totals.failed })}
          .{totals.capped > 0 && t("resultCapped")}
        </p>
      )}
    </div>
  )
}
