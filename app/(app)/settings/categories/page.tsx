import { getTranslations } from "next-intl/server"

import { CategoriesManager } from "@/components/categories-manager"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Category customization (ADR-0020, S6): hide seed Subcategories the Household doesn't use and add
 * custom ones under a group. The manager fetches + mutates the tree client-side via /api/categories.
 */
export default async function CategoriesSettingsPage() {
  await requireHousehold() // gate on auth; the manager loads the tree client-side
  const t = await getTranslations("categoriesManager")
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-pretty text-muted-foreground">{t("subtitle")}</p>
      </header>
      <CategoriesManager />
    </div>
  )
}
