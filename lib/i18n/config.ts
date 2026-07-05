// Supported locales for the app. `is` (Icelandic) is the default; `en` is the
// alternate. See CONTEXT.md (**Locale**) and ADR-0013.
const locales = ["is", "en"] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "is"

/** BCP-47 tag per Locale, for `Intl.*` formatters (format follows the Locale — ADR-0013). */
export const bcp47: Record<Locale, string> = { is: "is-IS", en: "en-US" }

/** Narrow an arbitrary value to a supported Locale, or `null` if unsupported. */
export function toLocale(value: string | undefined | null): Locale | null {
  return locales.includes(value as Locale) ? (value as Locale) : null
}
