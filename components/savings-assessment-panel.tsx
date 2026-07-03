import { CircleCheck, TriangleAlert } from "lucide-react"

import { cycleKeyLabel } from "@/lib/dashboard/cycle"
import type { SavingsAssessment, SavingsCycle } from "@/lib/savings/assessment"
import { currencyFormatter } from "@/lib/format/currency"
import type { Locale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The Savings assessment (ADR-0007): progress is DERIVED from spend, so this is read-only — no
 * check-in button. It shows whether the goal is on track, the coming cycle's corrective pace, and
 * how much `Nice to have` is still affordable, then a per-cycle breakdown newest-first. The current
 * in-progress cycle is shown in the breakdown but excluded from the total (ADR-0014) — its row reads
 * "not yet counted" rather than a saved amount.
 */
export function SavingsAssessmentPanel({
  assessment,
  cycles,
  currency,
  locale,
  className,
}: {
  assessment: SavingsAssessment
  cycles: SavingsCycle[]
  currency: string
  locale: Locale
  className?: string
}) {
  const money = currencyFormatter(currency, locale)
  // Newest cycle first for the breakdown; the loader returns oldest first for the cumulative math.
  const newestFirst = [...cycles].sort((a, b) => (a.cycleKey < b.cycleKey ? 1 : -1))

  return (
    <section aria-label="Savings assessment" className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Where the goal stands</h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Derived from your income, off-card costs, and each cycle&rsquo;s spending.
          </p>
        </div>

        <div
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
            assessment.onTrack
              ? "border border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
              : "border border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
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
                On track — {money.format(assessment.cumulative)} saved of the{" "}
                {money.format(assessment.requiredCumulative)} needed by now.
              </>
            ) : (
              <>
                Behind — {money.format(assessment.cumulative)} saved of the{" "}
                {money.format(assessment.requiredCumulative)} needed by now. Save{" "}
                {money.format(assessment.requiredSaving)} per cycle to catch up.
              </>
            )}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <dt className="truncate text-xs text-muted-foreground">Allowed nice to have</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {money.format(assessment.allowedNiceToHave)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="truncate text-xs text-muted-foreground">Required per cycle</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {money.format(assessment.requiredSaving)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="truncate text-xs text-muted-foreground">Expected fixed</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {money.format(assessment.expectedFixed)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="truncate text-xs text-muted-foreground">Expected necessary</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {money.format(assessment.expectedNecessary)}
            </dd>
          </div>
        </dl>

        {assessment.provisional && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
            This month isn&rsquo;t in your total yet — it counts once the calendar month closes.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">By cycle</h2>
        {newestFirst.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet — progress starts once the goal&rsquo;s start cycle begins.
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
                  <tr
                    key={row.cycleKey}
                    className={cn(
                      "border-b border-border/50",
                      // The in-progress cycle is shown but excluded from the total (ADR-0014).
                      row.inProgress && "text-muted-foreground",
                    )}
                  >
                    <td className="py-2 pr-4">
                      {cycleKeyLabel(row.cycleKey)}
                      {row.inProgress && " (this month)"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money.format(row.monthlyIncome)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money.format(row.offCardFixed)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money.format(row.cardDebits)}
                    </td>
                    {row.inProgress ? (
                      <td className="py-2 pl-4 text-right text-xs italic">Not yet counted</td>
                    ) : (
                      <td
                        className={cn(
                          "py-2 pl-4 text-right font-medium tabular-nums",
                          row.inferredSaving < 0 && "text-destructive",
                        )}
                      >
                        {money.format(row.inferredSaving)}
                      </td>
                    )}
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
