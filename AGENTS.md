<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Localization (i18n) — MANDATORY

This app is bilingual: **Icelandic (`is`, default)** + **English (`en`)**. See
[CONTEXT.md](./CONTEXT.md) (**Locale**), [ADR-0013](./docs/adr/0013-localization-next-intl-per-member-no-url-prefix.md),
and the rollout plan in [docs/i18n-rollout.md](./docs/i18n-rollout.md).

**Never hard-code user-facing strings.** Every UI string comes from a catalog:

- Add each new string to **both** `messages/en.json` and `messages/is.json` — the
  key sets must stay identical (`lib/i18n/parity.test.ts` fails otherwise).
- Server Components: `const t = await getTranslations("ns")` (`next-intl/server`).
  Client Components: `const t = useTranslations("ns")` (`next-intl`).
- **Never** instantiate `Intl.*` in a component — use the locale-aware helpers in
  `lib/format/*` (formatting follows the Locale).
- Tests: wrap components with `renderWithIntl` from `@/lib/test/render`.
- **Exempt** (dynamic data, not UI chrome): merchant names, user input, and AI
  Classification `reasoning` (stays English — see CONTEXT.md).

A blocking ESLint rule enforcing this lands in the final rollout slice; until then
this rule is the guard, so honor it in every PR.
