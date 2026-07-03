import { bcp47, type Locale } from "@/lib/i18n/config"

const formatters = new Map<string, Intl.NumberFormat>()

/**
 * A memoized whole-amount currency formatter (no fraction digits) — one
 * `Intl.NumberFormat` instance per locale + currency, shared across renders and
 * components rather than re-created each time. Formatting follows the Locale
 * (ADR-0013): e.g. `is` renders `1.234.567 kr.` where `en` renders `ISK 1,234,567`.
 * Dashboard bucket amounts are whole units in the Household's billing currency (ADR-0004).
 */
export function currencyFormatter(
  currency: string,
  locale: Locale
): Intl.NumberFormat {
  const key = `${locale}:${currency}`
  const cached = formatters.get(key)
  if (cached) return cached
  const formatter = new Intl.NumberFormat(bcp47[locale], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })
  formatters.set(key, formatter)
  return formatter
}
