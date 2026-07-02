import { Suspense } from "react"

import { AccountsManager } from "@/components/accounts-manager"
import { BankConnections } from "@/components/bank-connections"
import { BankSyncGate } from "@/components/bank-sync-gate"
import { ConnectBank } from "@/components/connect-bank"
import { ConnectionAlerts } from "@/components/connection-alerts"
import { InitialSyncOnConnect } from "@/components/initial-sync-on-connect"
import { requireHousehold } from "@/lib/household/current"
import { buildConnectionViews } from "@/lib/open-banking/connections-view"
import { reconnectPrompts } from "@/lib/open-banking/reconnect"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/** Accounts management (Phase H): the card/bank accounts uploads attach to. */
export default async function AccountsPage() {
  const { repo, plan } = await requireHousehold() // gate on auth; the manager fetches the list client-side
  const [connections, accounts] = await Promise.all([
    repo.bankConnections.list(),
    repo.accounts.list(),
  ])
  const reconnect = reconnectPrompts(connections, new Date())
  const connectionViews = buildConnectionViews(connections, accounts)
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          The card and bank accounts your statement uploads attach to.
        </p>
      </header>
      <Suspense fallback={null}>
        <InitialSyncOnConnect />
      </Suspense>
      <ConnectionAlerts prompts={reconnect} />
      <BankSyncGate plan={plan}>
        <ConnectBank />
      </BankSyncGate>
      <BankConnections connections={connectionViews} />
      <AccountsManager />
    </div>
  )
}
