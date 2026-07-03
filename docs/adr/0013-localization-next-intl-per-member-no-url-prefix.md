# Localization: next-intl, per-Member locale, no URL prefix, lint-enforced

The app must ship bilingual (Icelandic default + English), with no hard-coded UI
strings and a guard that keeps it that way. We chose **next-intl** for its
first-class App Router / RSC support and TypeScript-typed message keys (a
renamed/missing key becomes a compile error).

**No locale URL prefix.** The app is entirely behind auth and **Locale** is a
per-**Member** preference, so `/is/…` vs `/en/…` would add churn to every route
and `<Link>` for zero SEO benefit. Locale resolves from a cookie (mirrored from
`member.locale` in the DB). Logged out: cookie → Vercel geolocation (`IS` →
`is`) → `Accept-Language` → `is`.
This deviates from the common next-intl setup, which assumes prefixed routing —
recorded here so a future reader doesn't "add" the prefix.

**Format follows Locale.** One resolved locale drives both translated text and
every `Intl` number/date formatter (replacing the current `en-US` hard-coding,
which was a latent bug on Icelandic data). Formatters are centralized in
`lib/format/*` so no component instantiates `Intl` directly.

**Enforcement is lint + CI, added last.** A blocking ESLint rule bans literal
strings in `app/**` + `components/**` JSX (scoped to exclude API routes, `lib/`,
tests, scripts, drizzle; non-user-facing attributes ignored), plus a CI check
asserting `en.json` and `is.json` have identical key sets (no silent
English fallback). Enforcement flips on in the final PR, after the tree is
migrated in batches. AI **Classification** `reasoning` is Household-shared data
generated once — it stays English, is dynamic, exempt from catalogs/lint, and
not localized (v1).

Third-party **Neon Auth** UI and its OTP emails are not localized in v1
(English), an accepted limitation. The logged-out landing page is bilingual.

_Considered and rejected:_ Paraglide/react-intl (thinner Next 16 routing / RSC
ergonomics); URL-prefixed routing (no benefit behind auth); runtime-only
enforcement (misses code paths no test renders).
