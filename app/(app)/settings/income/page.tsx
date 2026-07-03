import { getTranslations } from "next-intl/server"

import { SavingsConfigForm } from "@/components/savings-config-form"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Income & recurring costs: the household's monthly income sources (salary, rent, …) and off-card
 * fixed costs. A core budgeting input in its own right — the Savings goal reads these to infer
 * progress, but they are no longer edited from inside the Savings page. Saved via `/api/savings/config`.
 */
export default async function IncomeSettingsPage() {
  await requireHousehold() // gate on auth; the form fetches the config client-side
  const t = await getTranslations("incomeSettings")
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-pretty text-muted-foreground">{t("pageDescription")}</p>
      </header>
      <SavingsConfigForm />
    </div>
  )
}
