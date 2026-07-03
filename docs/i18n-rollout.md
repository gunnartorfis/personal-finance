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
- [x] **3a. Resolution precedence (no DB).** Pure `resolveLocale` in `lib/i18n/resolve.ts`:
  cookie → Vercel geo (`x-vercel-ip-country` `IS`→`is`) → `Accept-Language` → `is`;
  `resolveRequestLocale` now feeds it cookie + geo + `Accept-Language` from the request.
  (Split out of the original slice 3 to keep PRs small; the `member.locale` DB tier +
  switcher are 3b.)
- [x] **3b. Member locale (DB + resolution + API).** Drizzle `locale` column on
  `members` + migration; `member.locale` slots into the precedence ahead of geo
  (cookie → `member.locale` → geo → `Accept-Language` → `is`), consulted only on a
  cookie miss (`currentMemberLocale`, lazy-loaded to keep auth out of the pure path);
  `PUT /api/settings/locale` writes both the column and the `NEXT_LOCALE` cookie.
  (Switcher UI split to 3c; the codebase uses API routes + client fetch, not server
  actions.)
- [x] **3c. Language switcher UI.** `LocaleSwitcher` in the sidebar footer
  (`components/locale-switcher.tsx`): offers the other locale, `PUT`s
  `/api/settings/locale`, then `router.refresh()`. Own strings localized via
  next-intl (`localeSwitcher` namespace, both catalogs). Built on the existing
  `Sidebar` primitives (design-system-consistent); a full `/design` pass can refine
  the visual treatment later.
- [x] **4a. Migrate: dashboard page + hero.** `dashboard/page.tsx` (title/subtitle via
  `getTranslations`) and `ThisMonthHero` (`useTranslations`/`useLocale`, locale-aware
  currency + the new `formatCycleMonth` date helper) → `dashboard` namespace. Established
  the pattern: sync Server Components call `useTranslations`/`useLocale` (work in RSC and
  under `renderWithIntl` in tests); async pages use `getTranslations`.
- [x] **4b. Migrate: dashboard list modules.** `top-merchants` + `account-breakdown`
  (headings via `dashboard` namespace) and `biggest-movers` (strings +
  `currencyFormatter`). Category names stay English (enum data).
- [x] **4c. Migrate: action band.** `action-band` → `actionBand` namespace (ICU plurals
  for the review-backlog / pending / failed alerts + all-clear + aria-labels). Its child
  banners (free-cap, connection alerts, classify-trigger) belong to their own slices.
> **Reordered (2026-07-03):** the repo has concurrent refactors of the charts,
> savings, and transactions areas (see memory `finance-concurrent-development`), so
> those slices (4d, 4e, 5, 6) are **DEFERRED** to avoid conflicts — done last, once
> those refactors settle. The loop works the **cold** areas first (household/invites,
> billing, upload, accounts, rules, landing/nav). Enforcement (10) is always last.

- [ ] **4d/4e. Migrate: dashboard charts.** DEFERRED (concurrent shadcn/recharts
  refactor). `spending-trend-chart` (parked draft #182, now stale vs recharts) +
  `category-mix-module`. Once no caller of `cycleKeyLabel`/`shortCycleLabel` remains,
  delete them from `lib/dashboard/cycle.ts`.
- [ ] **5. Migrate: transactions.** DEFERRED (concurrent refactor). Table, review-mode,
  override, income, net-summary-card, spending-by-type; expense-type labels via catalog
  (canonical enum stays English). AI `reasoning` stays English (data).
- [ ] **6. Migrate: savings.** DEFERRED (concurrent refactor). Goal, config, check-in.
- [ ] **7. Migrate: household + invites + billing** (COLD — in progress).
  - [x] **7a. household-reset** ("danger zone" data-reset control) → `householdReset`.
  - [ ] **7b. household page + household-manager** (members, invite, pending, danger zone).
  - [ ] **7c. invites**: invite-card, accept-invite, verify-email-gate, `app/join/*`.
  - [ ] **7d. billing**: billing page, manage-subscription, premium-checkout, free-cap.
- [ ] **8. Migrate: upload + accounts + rules.**
- [ ] **9. Migrate: landing + auth shell.** Bilingual landing (Vercel-geo default).
  Neon Auth UI + OTP emails stay English (v1).
- [ ] **10. Enforcement flip.** Blocking ESLint rule banning literal JSX strings in
  `app/**` + `components/**` (exclude API routes, `lib/`, tests, scripts, drizzle;
  ignore non-user-facing attrs); CI **key-parity** check (`keys(en) ≡ keys(is)`).
  Remove temporary disables. Verify lint fails on a planted hard-coded string.
