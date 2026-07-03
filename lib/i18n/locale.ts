import { cookies, headers } from "next/headers"

import { defaultLocale, toLocale, type Locale } from "@/lib/i18n/config"
import { resolveLocale } from "@/lib/i18n/resolve"

export const LOCALE_COOKIE = "NEXT_LOCALE"

/** Coerce an arbitrary value to a supported Locale, falling back to the default. */
export function normalizeLocale(value: string | undefined | null): Locale {
  return toLocale(value) ?? defaultLocale
}

/**
 * Resolve the request's Locale from cookie → Vercel geo → `Accept-Language` →
 * default (ADR-0013). The `member.locale` tier (ahead of geo) lands with the DB
 * column in slice 3b (see docs/i18n-rollout.md).
 */
export async function resolveRequestLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  return resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    geoCountry: headerStore.get("x-vercel-ip-country"),
    acceptLanguage: headerStore.get("accept-language"),
  })
}
