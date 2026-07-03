import { defaultLocale, toLocale, type Locale } from "@/lib/i18n/config"

export interface LocaleSources {
  /** `NEXT_LOCALE` cookie value (an explicit prior choice). */
  cookie?: string | null
  /** Vercel geo header `x-vercel-ip-country` (ISO-3166-1 alpha-2). */
  geoCountry?: string | null
  /** Raw `Accept-Language` request header. */
  acceptLanguage?: string | null
}

/** The first supported Locale in an `Accept-Language` header, by quality, else `null`. */
export function localeFromAcceptLanguage(
  header: string | undefined | null
): Locale | null {
  if (!header) return null
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";")
      const q = params.find((p) => p.trim().startsWith("q="))
      const quality = q ? Number(q.trim().slice(2)) : 1
      return {
        primary: tag.trim().toLowerCase().split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
      }
    })
    .filter((entry) => entry.primary.length > 0)
    .sort((a, b) => b.quality - a.quality)

  for (const { primary } of ranked) {
    const match = toLocale(primary)
    if (match) return match
  }
  return null
}

/**
 * Resolve a Locale from request signals in precedence order (ADR-0013):
 * cookie → Vercel geo (`IS` → `is`) → `Accept-Language` → default (`is`).
 * The `member.locale` tier slots in ahead of geo in a later slice (3b).
 */
export function resolveLocale(sources: LocaleSources): Locale {
  return (
    toLocale(sources.cookie) ??
    (sources.geoCountry?.toUpperCase() === "IS" ? "is" : null) ??
    localeFromAcceptLanguage(sources.acceptLanguage) ??
    defaultLocale
  )
}
