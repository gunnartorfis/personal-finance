import { CircleCheck, TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"

import type { SavingsAssessment, SavingsCycle } from "@/lib/savings/assessment"
import { currencyFormatter } from "@/lib/format/currency"
import { formatCycleMonth } from "@/lib/format/date"
import type { Locale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The Savings assessment (ADR-0007): progress is DERIVED from spend, so this is read-only — no
 * check-in button. It shows whether the goal is on track, the coming cycle's corrective pace, and
 * how much `Nice to have` is still affordable, then a per-cycle breakdown newest-first. The current
 * in-progress cycle is shown in the breakdown but excluded from the total (ADR-0021) — its row reads
 * "not yet counted" rather than a saved amount.
 */
export function SavingsAssessmentPanel({
  assessment,
  cycles,
  currency,
  locale,
  title,
  className,
}: {
  assessment: SavingsAssessment
  cycles: SavingsCycle[]
  currency: string
  locale: Locale
  /** The goal's optional display name (e.g. "Wedding"); headlines the panel when set. */
  title?: string | null
  className?: string
}) {
  const t = useTranslations("savings.assessment")
  const tGoal = useTranslations("savings.goal")
  const money = currencyFormatter(currency, locale)
  // Newest cycle first for the breakdown; the loader returns oldest first for the cumulative math.
  const newestFirst = [...cycles].sort((a, b) =>
    a.cycleKey < b.cycleKey ? 1 : -1
  )

  return (
    <section
      aria-label={t("regionLabel")}
      className={cn("flex flex-col gap-6", className)}
    >
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col gap-1">
          {title && (
            <span className="text-xs font-medium text-muted-foreground">
              {tGoal("regionLabel")}
            </span>
          )}
          <h2 className="text-base font-semibold">{title ?? t("heading")}</h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

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
            <CircleCheck
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
          ) : (
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
          )}
          <p>
            {assessment.onTrack
              ? // Nested under onTrack (never contradicts the icon/styling): with no closed cycle the
                // "needed by now" baseline is just the starting balance, so "X of X needed by now"
                // reads as a tautology — frame it as a start instead.
                assessment.cyclesElapsed === 0
                ? t("statusStart", {
                    saved: money.format(assessment.cumulative),
                  })
                : t("statusOnTrack", {
                    saved: money.format(assessment.cumulative),
                    required: money.format(assessment.requiredCumulative),
                  })
              : t("statusBehind", {
                  saved: money.format(assessment.cumulative),
                  required: money.format(assessment.requiredCumulative),
                  perCycle: money.format(assessment.requiredSaving),
                })}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <dt className="truncate text-xs text-muted-foreground">
              {t("allowedNiceToHave")}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {money.format(assessment.allowedNiceToHave)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="truncate text-xs text-muted-foreground">
              {t("requiredPerCycle")}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {money.format(assessment.requiredSaving)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="truncate text-xs text-muted-foreground">
              {t("expectedFixed")}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {money.format(assessment.expectedFixed)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="truncate text-xs text-muted-foreground">
              {t("expectedNecessary")}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {money.format(assessment.expectedNecessary)}
            </dd>
          </div>
        </dl>

        {assessment.provisional && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
            {t("provisional", {
              cycle: formatCycleMonth(assessment.cycleKey, locale),
            })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t("byCycle")}</h2>
        {newestFirst.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t("colCycle")}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    {t("colIncome")}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    {t("colOffCard")}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    {t("colCardDebits")}
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">
                    {t("colSaved")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((row) => (
                  <tr
                    key={row.cycleKey}
                    className={cn(
                      "border-b border-border/50",
                      // The in-progress cycle is shown but excluded from the total (ADR-0021).
                      row.inProgress && "text-muted-foreground"
                    )}
                  >
                    <td className="py-2 pr-4">
                      {formatCycleMonth(row.cycleKey, locale)}
                      {row.inProgress && ` ${t("thisMonth")}`}
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
                      <td className="py-2 pl-4 text-right text-xs italic">
                        {t("notYetCounted")}
                      </td>
                    ) : (
                      <td
                        className={cn(
                          "py-2 pl-4 text-right font-medium tabular-nums",
                          row.inferredSaving < 0 && "text-destructive"
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
