import Link from "next/link"

import { SavingsCheckin } from "@/components/savings-checkin"
import { SavingsGoalForm } from "@/components/savings-goal-form"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Savings goal (ADR-0007, Phase J): set the goal, then check in ~monthly after a cycle's
 * transactions land to see if the goal is on track and how much `Nice to have` is still affordable.
 * Progress is inferred from spend, never an entered balance. The income sources and off-card costs
 * behind the math are configured under Settings → Income & recurring costs.
 */
export default async function SavingsPage() {
  await requireHousehold() // gate on auth; the components fetch client-side
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Savings</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Your goal and a monthly check-in on whether it&rsquo;s on track. Set the income and
          off-card costs behind it under{" "}
          <Link
            href="/settings/income"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Settings
          </Link>
          .
        </p>
      </header>
      <SavingsCheckin />
      <section aria-label="Goal" className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">Goal</h2>
        <SavingsGoalForm />
      </section>
    </div>
  )
}
