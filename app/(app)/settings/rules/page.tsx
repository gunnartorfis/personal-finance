import { MerchantRulesManager } from "@/components/merchant-rules-manager"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/** Merchant-rule management (Phase H): deterministic merchant→type rules applied before the AI. */
export default async function RulesSettingsPage() {
  await requireHousehold() // gate on auth; the manager fetches the list client-side
  return (
    <div className="flex flex-col gap-8">
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
