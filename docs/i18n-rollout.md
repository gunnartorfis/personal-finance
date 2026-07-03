# Localization rollout — PR checklist

Driver for the automated PR loop. Each slice ships as one small, independently
reviewable PR, built off fresh `origin/main`, using the `/tdd` skill. Decisions
behind this live in [ADR-0013](./adr/0013-localization-next-intl-per-member-no-url-prefix.md);
domain terms in [CONTEXT.md](../CONTEXT.md) (**Locale**).

**Rules for every slice**
- One coherent concern; keep the diff small and reviewable.
- `/tdd` red-green-refactor. Before opening the PR: `pnpm typecheck`, `pnpm lint`,
  `pnpm test:run`, `pnpm build` all green.
- Tick this slice's box **in the same PR** (sequential merge gate → no conflicts).
- Loop each PR through Greptile to **5/5 + all checks green**, then **stop and wait
  for a human to merge** before starting the next slice.

## Slices

- [x] **1. i18n infra (no DB).** Install `next-intl` (verify Next 16.2 support),
  request config with **no URL routing**, `NextIntlClientProvider` in root layout,
  `messages/en.json` + `messages/is.json` scaffold (namespaced by feature),
  dynamic `<html lang>`, v0 locale resolution (cookie `NEXT_LOCALE` → `is`), and a
  test render helper wrapping the provider defaulting to `en`. Docs: add the
  no-hard-coded-strings rule to `AGENTS.md` + `CLAUDE.md`.
- [x] **2. Locale-aware currency formatter.** `lib/format/currency.ts` now takes a
  `Locale` (`is-IS`/`en-US`, memoized per locale+currency) via `bcp47` in
  `lib/i18n/config`; `locale` is threaded as a prop from the pages to the
  currency-formatting components (savings cards, spend-share list & its callers).
  **Scoped down from the original plan:** the remaining inline `Intl.*` (date/cycle
  labels in `lib/dashboard/cycle.ts` and the other components) is migrated within each
  screen slice below — where those components are already being touched for strings —
  rather than in one sweeping formatter PR. The final enforcement slice's ESLint rule
  bans direct `new Intl` in components, guaranteeing none are missed.
- [ ] **3. Member locale + real resolution + switcher.** Drizzle `locale` column +
  migration; resolution precedence cookie → `member.locale` → Vercel geo (`IS`→`is`)
  → `Accept-Language` → `is`; locale switcher in the app-shell account menu
  (persists to DB + cookie).
- [ ] **4. Migrate: dashboard.** All strings in `app/(app)/dashboard` + its modules
  → catalogs (both locales).
- [ ] **5. Migrate: transactions.** Table, review-mode, override, income; expense-type
  labels via catalog (canonical enum stays English). AI `reasoning` stays English (data).
- [ ] **6. Migrate: savings.** Goal, config, check-in surfaces.
- [ ] **7. Migrate: billing + household + invites.**
- [ ] **8. Migrate: upload + accounts + rules.**
- [ ] **9. Migrate: landing + auth shell.** Bilingual landing (Vercel-geo default).
  Neon Auth UI + OTP emails stay English (v1).
- [ ] **10. Enforcement flip.** Blocking ESLint rule banning literal JSX strings in
  `app/**` + `components/**` (exclude API routes, `lib/`, tests, scripts, drizzle;
  ignore non-user-facing attrs); CI **key-parity** check (`keys(en) ≡ keys(is)`).
  Remove temporary disables. Verify lint fails on a planted hard-coded string.
