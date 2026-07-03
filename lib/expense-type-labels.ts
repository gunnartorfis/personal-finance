import { useTranslations } from "next-intl"

import type { ExpenseType } from "@/shared/types"

/**
 * Localized labels for the canonical {@link ExpenseType} enum, resolved from the `expenseType`
 * catalog with literal keys and indexed by the enum value (which stays English as the data value).
 * `""` is the not-bucketed / split type, shown as "Split / none" (distinct from the charts' "Other"
 * label for the same bucket, hence its own namespace rather than sharing `expenseCategory`).
 */
export function useExpenseTypeLabels(): Record<ExpenseType, string> {
  const t = useTranslations("expenseType")
  return {
    Fixed: t("fixed"),
    Necessary: t("necessary"),
    "Nice to have": t("niceToHave"),
    "": t("splitNone"),
  }
}
