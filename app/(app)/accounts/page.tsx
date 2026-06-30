import { AccountsManager } from "@/components/accounts-manager"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/** Accounts management (Phase H): the card/bank accounts uploads attach to. */
export default async function AccountsPage() {
  await requireHousehold() // gate on auth; the manager fetches the list client-side
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          The card and bank accounts your statement uploads attach to.
        </p>
      </header>
      <AccountsManager />
    </div>
  )
}
