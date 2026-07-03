import { getLocale } from "next-intl/server"
import Link from "next/link"

import { SavingsAssessmentPanel } from "@/components/savings-assessment-panel"
import { SavingsGoalForm } from "@/components/savings-goal-form"
import type { Locale } from "@/lib/i18n/config"
import { requireHousehold } from "@/lib/household/current"
import { loadSavingsSnapshot } from "@/lib/savings/assessment"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Savings goal (ADR-0007, Phase J): set the goal, then see whether it's on track. Progress is
 * inferred from spend automatically — no manual check-in. Income sources and off-card costs that
 * anchor the math live under Settings → Income & recurring costs.
 */
export default async function SavingsPage() {
  const { repo, billingCurrency } = await requireHousehold()
  const locale = (await getLocale()) as Locale
  const snapshot = await loadSavingsSnapshot(repo, new Date())

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Savings</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Your goal and whether it&rsquo;s on track — progress is inferred from spend, never an
          entered balance. Set your income and off-card costs under{" "}
          <Link
            href="/settings/income"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Settings
          </Link>
          .
        </p>
      </header>
      {snapshot && (
        <SavingsAssessmentPanel
          assessment={snapshot.assessment}
          cycles={snapshot.cycles}
          currency={billingCurrency}
          locale={locale}
        />
      )}
      <section aria-label="Goal" className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">Goal</h2>
        <SavingsGoalForm />
      </section>
    </div>
  )
}
