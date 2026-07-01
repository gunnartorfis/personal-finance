import { MerchantRulesManager } from "@/components/merchant-rules-manager"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/** Merchant-rule management (Phase H): deterministic merchant→type rules applied before the AI. */
export default async function RulesPage() {
  await requireHousehold() // gate on auth; the manager fetches the list client-side
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Merchant rules</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Deterministic merchant → type rules, applied before the AI classifier.
        </p>
      </header>
      <MerchantRulesManager />
    </div>
  )
}
