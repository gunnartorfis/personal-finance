import { SavingsCheckin } from "@/components/savings-checkin"
import { SavingsConfigForm } from "@/components/savings-config-form"
import { SavingsGoalForm } from "@/components/savings-goal-form"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Savings goal (ADR-0007, Phase J): set the goal and the income/off-card config, then check in
 * ~monthly after a cycle's transactions land to see if the goal is on track and how much
 * `Nice to have` is still affordable. Progress is inferred from spend, never an entered balance.
 */
export default async function SavingsPage() {
  await requireHousehold() // gate on auth; the components fetch client-side
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Savings</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Your goal, the money behind it, and a monthly check-in on whether it&rsquo;s on track.
        </p>
      </header>
      <SavingsCheckin />
      <section aria-label="Goal and config" className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">Goal &amp; config</h2>
        <SavingsGoalForm />
        <SavingsConfigForm />
      </section>
    </div>
  )
}
