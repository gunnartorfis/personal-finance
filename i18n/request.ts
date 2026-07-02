import { getRequestConfig } from "next-intl/server"

import { resolveRequestLocale } from "@/lib/i18n/locale"

// next-intl request config (no i18n routing — locale comes from cookie/DB, not
// the URL; ADR-0013). Wired via createNextIntlPlugin() in next.config.ts.
export default getRequestConfig(async () => {
  const locale = await resolveRequestLocale()
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
