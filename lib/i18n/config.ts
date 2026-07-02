// Supported locales for the app. `is` (Icelandic) is the default; `en` is the
// alternate. See CONTEXT.md (**Locale**) and ADR-0013.
export const locales = ["is", "en"] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "is"
