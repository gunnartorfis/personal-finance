import { bcp47, type Locale } from "@/lib/i18n/config"

const formatters = new Map<string, Intl.NumberFormat>()

/**
 * A memoized whole-percent formatter (no fraction digits) — one `Intl.NumberFormat`
 * instance per locale, shared across renders. Takes a 0..1 fraction and renders it as
 * a percentage following the Locale (ADR-0013), e.g. `0.2` → `20%`; a signed variant is
 * available for deltas. Used for the dashboard's savings rate (ADR-0016).
 */
export function percentFormatter(locale: Locale, signed = false): Intl.NumberFormat {
  const key = `${locale}:${signed}`
  const cached = formatters.get(key)
  if (cached) return cached
  const formatter = new Intl.NumberFormat(bcp47[locale], {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: signed ? "exceptZero" : "auto",
  })
  formatters.set(key, formatter)
  return formatter
}
