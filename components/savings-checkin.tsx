"use client"

import { CircleAlert, CircleCheck, Loader2, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { cycleKeyLabel } from "@/lib/dashboard/cycle"
import { currencyFormatter } from "@/lib/format/currency"
import { cn } from "@/lib/utils"

interface CheckinRow {
  id: string
  cycleKey: string
  monthlyIncome: number
  cycleExtra: number
  offCardFixed: number
  cardDebits: number
  inferredSaving: number
}

interface Assessment {
  cycleKey: string
  cumulative: number
  requiredCumulative: number
  onTrack: boolean
  cyclesElapsed: number
  cyclesRemaining: number
  requiredSaving: number
  expectedFixed: number
  expectedNecessary: number
  expectedSource: "history" | "manual" | "none"
  allowedNiceToHave: number
  provisional: boolean
}

const isk = currencyFormatter("ISK")

/**
 * The monthly Check-in (ADR-0007, Phase J): freeze the current Statement cycle and see whether
 * the Savings goal is on track, what the coming cycle must save (rises when behind), and how much
 * `Nice to have` is still affordable. Below it, the frozen check-in history, newest first.
 */
export function SavingsCheckin({ className }: { className?: string }) {
  const [checkins, setCheckins] = useState<CheckinRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [error, setError] = useState<"none" | "no-goal" | "failed">("none")

  async function fetchCheckins(): Promise<CheckinRow[]> {
    const res = await fetch("/api/savings/checkins")
    if (!res.ok) throw new Error("could not load check-ins")
    return (await res.json()) as CheckinRow[]
  }

  useEffect(() => {
    let ignore = false
    async function loadInitial() {
      try {
        const data = await fetchCheckins()
        if (!ignore) setCheckins(data)
      } catch {
        // The empty state covers a failed load; a retry happens on the next check-in.
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void loadInitial()
    return () => {
      ignore = true
    }
  }, [])

  async function checkIn() {
    setBusy(true)
    setError("none")
    // Clear the previous run's assessment so a failed retry never shows stale numbers next to
    // the error.
    setAssessment(null)
    try {
      const res = await fetch("/api/savings/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error === "no-goal" ? "no-goal" : "failed")
        return
      }
      const body = (await res.json()) as { assessment: Assessment }
      setAssessment(body.assessment)
    } catch {
      setError("failed")
      return
    } finally {
      setBusy(false)
    }
    // The check-in itself succeeded; a failed history refetch just leaves the table stale — it
    // must not raise the check-in error next to the fresh assessment.
    try {
      setCheckins(await fetchCheckins())
    } catch {
      // Stale history is acceptable; the next load or check-in refreshes it.
    }
  }

  // Newest cycle first for the history — the API returns oldest first for the cumulative math.
  const newestFirst = [...checkins].sort((a, b) => (a.cycleKey < b.cycleKey ? 1 : -1))

  return (
    <section aria-label="Check-in" className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">Monthly check-in</h2>
            <p className="text-sm text-pretty text-muted-foreground">
              Freeze this cycle&rsquo;s numbers and see where the goal stands.
            </p>
          </div>
          <Button type="button" onClick={checkIn} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Check in now
          </Button>
        </div>

        {error === "no-goal" && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>Set a savings goal above before checking in.</p>
          </div>
        )}
        {error === "failed" && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>Couldn&rsquo;t check in. Try again.</p>
          </div>
        )}

        {assessment && (
          <div className="flex flex-col gap-4">
            <div
              role="status"
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
                assessment.onTrack
                  ? "border border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                  : "border border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400"
              )}
            >
              {assessment.onTrack ? (
                <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              ) : (
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              )}
              <p>
                {assessment.onTrack ? (
                  <>
                    On track — {isk.format(assessment.cumulative)} saved of the{" "}
                    {isk.format(assessment.requiredCumulative)} needed by now.
                  </>
                ) : (
                  <>
                    Behind — {isk.format(assessment.cumulative)} saved of the{" "}
                    {isk.format(assessment.requiredCumulative)} needed by now. Save{" "}
                    {isk.format(assessment.requiredSaving)} per cycle to catch up.
                  </>
                )}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <div className="flex flex-col gap-0.5">
                <dt className="truncate text-xs text-muted-foreground">Allowed nice to have</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {isk.format(assessment.allowedNiceToHave)}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="truncate text-xs text-muted-foreground">Required per cycle</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {isk.format(assessment.requiredSaving)}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="truncate text-xs text-muted-foreground">Expected fixed</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {isk.format(assessment.expectedFixed)}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="truncate text-xs text-muted-foreground">Expected necessary</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {isk.format(assessment.expectedNecessary)}
                </dd>
              </div>
            </dl>

            {assessment.provisional && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                Provisional — some of this cycle&rsquo;s expenses are still unclassified.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">History</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : newestFirst.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No check-ins yet — the first one freezes this cycle.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Cycle
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Income
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Off-card
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Card debits
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">
                    Saved
                  </th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="py-2 pr-4">{cycleKeyLabel(row.cycleKey)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {isk.format(row.monthlyIncome + row.cycleExtra)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {isk.format(row.offCardFixed)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {isk.format(row.cardDebits)}
                    </td>
                    <td
                      className={cn(
                        "py-2 pl-4 text-right font-medium tabular-nums",
                        row.inferredSaving < 0 && "text-destructive"
                      )}
                    >
                      {isk.format(row.inferredSaving)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
