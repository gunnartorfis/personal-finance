import { getTranslations } from "next-intl/server"

import { BudgetConfigForm } from "@/components/budget-config-form"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Category budgets (#103): a monthly budget per expense category. The dashboard tracks spend against
 * these; saved via `/api/budgets`. The form fetches the current budgets client-side.
 */
export default async function BudgetsSettingsPage() {
  await requireHousehold() // gate on auth; the form loads config client-side
  const t = await getTranslations("budgets")
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-pretty text-muted-foreground">{t("pageDescription")}</p>
      </header>
      <BudgetConfigForm />
    </div>
  )
}
