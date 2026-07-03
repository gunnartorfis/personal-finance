import { useTranslations } from "next-intl"

/** The canonical display-category keys used across the spend breakdown + charts (see CATEGORIES). */
export type ExpenseCategoryKey =
  | "Fixed"
  | "Necessary"
  | "Nice to have"
  | "Other"
  | "Unclassified"

/**
 * Localized labels for the spending display categories, resolved from the `expenseCategory` catalog
 * with literal keys (so next-intl's static checking holds) and indexed by the canonical category key
 * (which stays English as the enum/data value). Shared by the spend-by-type breakdown and the
 * mix-over-time chart so both read from one place.
 */
export function useCategoryLabels(): Record<ExpenseCategoryKey, string> {
  const t = useTranslations("expenseCategory")
  return {
    Fixed: t("fixed"),
    Necessary: t("necessary"),
    "Nice to have": t("niceToHave"),
    Other: t("other"),
    Unclassified: t("unclassified"),
  }
}
