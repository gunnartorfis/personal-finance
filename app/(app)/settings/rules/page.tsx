import { getTranslations } from "next-intl/server"

import { MerchantRulesManager } from "@/components/merchant-rules-manager"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/** Merchant-rule management (Phase H): deterministic merchant→type rules applied before the AI. */
export default async function RulesSettingsPage() {
  await requireHousehold() // gate on auth; the manager fetches the list client-side
  const t = await getTranslations("rules")
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>
      <MerchantRulesManager />
    </div>
  )
}
