import { useTranslations } from "next-intl"

import type { NavLabelKey } from "@/lib/nav"

/**
 * All navigation labels resolved from the `nav` catalog with literal keys (so next-intl's static
 * key checking holds), returned as a record indexed by the item's stable {@link NavLabelKey}.
 * Shared by the app sidebar, the inset header breadcrumb, and the settings nav so the resolution
 * lives in one place.
 */
export function useNavLabels(): Record<NavLabelKey, string> {
  const t = useTranslations("nav")
  return {
    dashboard: t("dashboard"),
    accounts: t("accounts"),
    transactions: t("transactions"),
    savings: t("savings"),
    settings: t("settings"),
    upload: t("upload"),
    rules: t("rules"),
    income: t("income"),
    budgets: t("budgets"),
    household: t("household"),
    billing: t("billing"),
    account: t("account"),
    security: t("security"),
  }
}
