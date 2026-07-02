import { AccountsManager } from "@/components/accounts-manager"
import { ConnectionAlerts } from "@/components/connection-alerts"
import { requireHousehold } from "@/lib/household/current"
import { reconnectPrompts } from "@/lib/open-banking/reconnect"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/** Accounts management (Phase H): the card/bank accounts uploads attach to. */
export default async function AccountsPage() {
  const { repo } = await requireHousehold() // gate on auth; the manager fetches the list client-side
  const reconnect = reconnectPrompts(await repo.bankConnections.list(), new Date())
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          The card and bank accounts your statement uploads attach to.
        </p>
      </header>
      <ConnectionAlerts prompts={reconnect} />
      <AccountsManager />
    </div>
  )
}
