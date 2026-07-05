import { useTranslations } from "next-intl";

/** The label-bearing fields of a Category row (ADR-0020): exactly one of labelKey / label is set. */
export interface CategoryLabelParts {
  /** i18n message key (namespace `categories`) for a seed row; null on a custom row. */
  labelKey: string | null;
  /** Literal display label for a custom row; null on a seed row. */
  label: string | null;
}

/**
 * Resolve a Category row's display label (ADR-0020). Seed rows localize via their `labelKey` (the
 * `categories` catalog); custom rows carry a literal `label` (user text, not translated — like
 * merchant names). Pure so it unit-tests with a fake translator; the {@link useCategoryLabel} hook
 * wraps it with the real next-intl `categories` namespace.
 */
export function resolveCategoryLabel(
  row: CategoryLabelParts,
  translate: (key: string) => string,
): string {
  if (row.labelKey) return translate(row.labelKey);
  return row.label ?? "";
}

/**
 * Hook returning a Category-row → localized label resolver bound to the `categories` catalog.
 * Seed rows are translated; custom rows show their literal label. Consumed by the category chart
 * and the transactions-list category column (S5b/S5c).
 */
// react-doctor-disable-next-line deslop/unused-export -- consumed by the S5 category chart + tx-list column (#105); helper landed first so both build on one resolver.
export function useCategoryLabel(): (row: CategoryLabelParts) => string {
  const t = useTranslations("categories");
  return (row) => resolveCategoryLabel(row, (key) => t(key));
}
