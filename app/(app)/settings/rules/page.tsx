import { getTranslations } from "next-intl/server"

import { MerchantRulesManager } from "@/components/merchant-rules-manager"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/** Merchant-rule management (Phase H): deterministic merchant→type rules applied before the AI. */
export default async function RulesSettingsPage() {
  // Gate on auth; the manager fetches the rule list client-side, but the Category picker's leaves
  // come from the server (ADR-0020) — only leaves (parent_id set) can be a rule's Category.
  const { repo } = await requireHousehold()
  const categoryRows = await repo.categories.list()
  const categories = categoryRows
    .filter((row) => row.parentId !== null)
    .map((row) => ({ id: row.id, labelKey: row.labelKey, label: row.label }))
  const t = await getTranslations("rules")
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>
      <MerchantRulesManager categories={categories} />
    </div>
  )
}
