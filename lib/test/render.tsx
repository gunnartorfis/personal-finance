import { render } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import type { ReactElement, ReactNode } from "react"

import type { Locale } from "@/lib/i18n/config"
import en from "@/messages/en.json"
import is from "@/messages/is.json"

const catalogs: Record<Locale, typeof en> = { en, is }

/**
 * Render a component wrapped in the intl provider. Defaults to the `en` catalog
 * so existing assertions on English copy keep working through the migration
 * (ADR-0013). Pass `{ locale: "is" }` to exercise the Icelandic catalog. Uses the
 * `wrapper` option so the returned `rerender` re-applies the provider.
 */
export function renderWithIntl(
  ui: ReactElement,
  { locale = "en" }: { locale?: Locale } = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
        {children}
      </NextIntlClientProvider>
    )
  }
  return render(ui, { wrapper: Wrapper })
}
