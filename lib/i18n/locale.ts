import { cookies, headers } from "next/headers"

import { defaultLocale, toLocale, type Locale } from "@/lib/i18n/config"
import { resolveLocale } from "@/lib/i18n/resolve"

export const LOCALE_COOKIE = "NEXT_LOCALE"

/** Coerce an arbitrary value to a supported Locale, falling back to the default. */
export function normalizeLocale(value: string | undefined | null): Locale {
  return toLocale(value) ?? defaultLocale
}

/**
 * Resolve the request's Locale by precedence (ADR-0013): cookie → `member.locale`
 * → Vercel geo → `Accept-Language` → default. The DB-backed member tier is only
 * consulted when the cookie is absent/invalid, keeping the common path DB-free.
 */
export async function resolveRequestLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const cookie = cookieStore.get(LOCALE_COOKIE)?.value
  // Lazy-load the DB/auth-backed member tier only on a cookie miss — both to skip
  // the DB on the fast path and to keep the auth import chain out of modules that
  // only need `LOCALE_COOKIE`/`normalizeLocale` from here.
  let memberLocale: Locale | null = null
  if (!toLocale(cookie)) {
    try {
      const { currentMemberLocale } = await import("@/lib/i18n/member-locale")
      memberLocale = await currentMemberLocale()
    } catch {
      // Locale is best-effort: a transient auth/DB error must never break a page
      // render via next-intl's request config. Fall through to geo/Accept-Language.
      memberLocale = null
    }
  }
  return resolveLocale({
    cookie,
    memberLocale,
    geoCountry: headerStore.get("x-vercel-ip-country"),
    acceptLanguage: headerStore.get("accept-language"),
  })
}
