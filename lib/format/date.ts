import { bcp47, type Locale } from "@/lib/i18n/config"

const formatters = new Map<string, Intl.DateTimeFormat>()

function dateFormatter(
  locale: Locale,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`
  const cached = formatters.get(key)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(bcp47[locale], options)
  formatters.set(key, formatter)
  return formatter
}

/**
 * Format a `YYYY-MM` Statement-cycle key as a localized month label — e.g.
 * `"March 2026"` (en) / `"mars 2026"` (is), or `"Mar"` with `{ short: true }`.
 * Anchored to UTC so the month never shifts across time zones. Format follows the
 * Locale (ADR-0013) — the locale-aware replacement for `cycleKeyLabel`/`shortCycleLabel`.
 */
export function formatCycleMonth(
  key: string,
  locale: Locale,
  opts?: { short?: boolean }
): string {
  const [year, month] = key.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return dateFormatter(locale, {
    month: opts?.short ? "short" : "long",
    year: opts?.short ? undefined : "numeric",
    timeZone: "UTC",
  }).format(date)
}
