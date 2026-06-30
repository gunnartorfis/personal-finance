import { AccountsManager } from "@/components/accounts-manager"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/** Accounts management (Phase H): the card/bank accounts uploads attach to. */
export default async function AccountsPage() {
  await requireHousehold() // gate on auth; the manager fetches the list client-side
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Accounts</h1>
      <AccountsManager />
    </main>
  )
}
