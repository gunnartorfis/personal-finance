import { Lock } from "lucide-react"
import Link from "next/link"

import { canUseBankSync } from "@/shared/bank-sync"
import type { Plan } from "@/shared/types"

/**
 * Premium gate for the bank-connection entry (#117). A Premium household sees the connect action
 * (`children`); a Free household sees an upgrade prompt in its place — bank auto-sync is Premium,
 * Free stays CSV-only. Mounted wherever a connect CTA is offered (the accounts page, #118); a caller
 * that needs layout/spacing wraps the gate itself, so the two variants stay structurally symmetric.
 */
export function BankSyncGate({
  plan,
  children,
}: {
  plan: Plan
  children: React.ReactNode
}) {
  if (canUseBankSync(plan)) return <>{children}</>

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">Connect your bank with Premium</p>
        <p className="text-muted-foreground">
          Automatic bank sync keeps your transactions up to date without CSV uploads.{" "}
          <Link
            href="/settings/billing"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Upgrade to Premium
          </Link>{" "}
          to connect a bank.
        </p>
      </div>
    </div>
  )
}
