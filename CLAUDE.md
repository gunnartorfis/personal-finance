# CLAUDE.md

Project rules for Claude Code. See [AGENTS.md](./AGENTS.md) for the full set
(Next.js conventions + localization).

## Localization (i18n) — do not hard-code UI strings

Bilingual app: Icelandic (`is`, default) + English (`en`). Every user-facing
string must come from a message catalog, with matching keys in **both**
`messages/en.json` and `messages/is.json`.

- Server Components: `getTranslations("ns")`; Client Components: `useTranslations("ns")`.
- Never call `Intl.*` directly in components — use `lib/format/*` (format follows Locale).
- Tests: `renderWithIntl` from `@/lib/test/render`.
- Exempt (data, not chrome): merchant names, user input, AI `reasoning` (stays English).

Full detail: [AGENTS.md](./AGENTS.md) · [CONTEXT.md](./CONTEXT.md) (**Locale**) ·
[ADR-0013](./docs/adr/0013-localization-next-intl-per-member-no-url-prefix.md) ·
[docs/i18n-rollout.md](./docs/i18n-rollout.md).
