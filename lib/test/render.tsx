import { render } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import type { ReactElement } from "react"

import en from "@/messages/en.json"

/**
 * Render a component wrapped in the intl provider. Defaults to the `en` catalog
 * so existing assertions on English copy keep working through the migration
 * (ADR-0013). Pass `{ locale: "is" }` to exercise Icelandic.
 */
export function renderWithIntl(
  ui: ReactElement,
  { locale = "en" }: { locale?: string } = {}
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={en}>
      {ui}
    </NextIntlClientProvider>
  )
}
