import { cookies } from "next/headers"

import { defaultLocale, locales, type Locale } from "@/lib/i18n/config"

export const LOCALE_COOKIE = "NEXT_LOCALE"

/** Coerce an arbitrary value to a supported Locale, falling back to the default. */
export function normalizeLocale(value: string | undefined | null): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale
}

/**
 * Resolve the request's Locale. v0 (this slice): cookie → default. The full
 * precedence — cookie → `member.locale` → Vercel geo → `Accept-Language` — lands
 * with the DB column in a later slice (see docs/i18n-rollout.md, ADR-0013).
 */
export async function resolveRequestLocale(): Promise<Locale> {
  const store = await cookies()
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value)
}
