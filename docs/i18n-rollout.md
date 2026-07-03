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

- [x] **4d/4e. Migrate: dashboard charts.** (Concurrent recharts refactor has landed;
  #182 was closed and redone fresh.) `spending-trend-chart` + `category-mix-module` +
  `mix-over-time-chart` → `charts` namespace: titles, legend/series labels, currency via
  `currencyFormatter`, cycle labels via `formatCycleMonth`, rich classify-nudge, ICU-free
  interpolated placeholder + sr-only summaries. Category names in the mix chart still come
  from `CATEGORIES` (owned by transactions/spending-by-type, slice 5) — they localize
  there. `cycleKeyLabel`/`shortCycleLabel` are now only used by savings/transactions
  (deferred) + `lib/dashboard/cycle`; delete once those migrate.
- [ ] **5. Migrate: transactions.** (Resumed — area settled.) Income done in #204.
  - [x] **5a. spend breakdown** (`net-summary-card` + `spending-by-type` + the mix chart's
    category labels) → `netSummary` + `spendingByType` + shared `expenseCategory`
    namespaces via a `useCategoryLabels()` hook (canonical `CATEGORIES` keys stay English;
    labels localize at the presentation layer). `renderWithIntl` now uses the RTL `wrapper`
    option so `rerender` re-applies the provider.
  - [x] **5b. row-type control** (the Type pill/menu + split/exclude inline editors) →
    `rowType` namespace + shared `useExpenseTypeLabels()` (`expenseType` namespace,
    incl. `""`→"Split / none"); guarded expense-type labels, `{merchant}`/`{type}`/
    `{amount}` interpolation, keyed save errors.
  - [ ] **5c. transactions table** (`transactions-table.tsx` — headers, filters,
    empty/loading states, date/currency) — next.
- [ ] **6. Migrate: savings.** DEFERRED — handled by the concurrent ADR-0015 stream
  (income/config already localized under `incomeSettings` in #204/#206). Goal + check-in
  remain to that stream.
- [ ] **7. Migrate: household + invites + billing** (COLD — in progress).
  - [x] **7a. household-reset** ("danger zone" data-reset control) → `householdReset`.
  - [x] **7b. household page + household-manager** (members, invite form, premium upsell,
    pending invites, danger zone leave/delete) → `household` namespace; ICU cap
    interpolation, invite/leave error-code maps, `t.rich` delete description.
  - [x] **7c. invite acceptance card**: invite-card (locale-aware relative expiry +
    member-count plural + `t.rich`) + accept-invite (labels, static error map) → `invites`.
  - [x] **7c-2. join flow**: verify-email-gate (resend states, rich email body) + `app/join/page.tsx`
    (pending-count plural) + `app/join/[token]/page.tsx` (invalid-link state) → `join` namespace.
  - [x] **7d. billing (page + subscription + free-cap)**: billing page, manage-subscription
    (locale-aware renewal date, period labels, cancel flow), free-cap-status (rich upgrade
    link) → `billing` + `freeCap` namespaces.
  - [x] **7e. premium-checkout** (Adyen checkout UI): period options + locale-aware
    ISK price (`currencyFormatter` + localized /mo·/yr), phase/loading/error strings →
    `billing.checkout` namespace; test switched to `renderWithIntl`.
- [x] **8. Migrate: upload + accounts + rules.**
  - [x] **8a. upload** (upload page + upload-form + upload-progress) → `upload`
    namespace: account picker / file labels + hints, submit/loading states,
    keyed upload errors (static status→key map, server `{error}` passed through),
    discriminated progress status line.
  - [x] **8b. accounts** (accounts page header + accounts-manager) → `accounts`
    namespace: name label/placeholder, add button, add/load error alerts, loading
    + empty states, region aria-label. Bank-connection components (ConnectBank,
    BankConnections, ConnectionAlerts, bank-sync-gate) are their own later slice;
    settings/account is Neon Auth's view (English v1, exempt).
  - [x] **8c. rules** (rules page header + merchant-rules-manager) → `rules`
    namespace: merchant/type field labels + placeholder, add/delete buttons +
    delete aria-label, keyed add/delete errors (server `{error}` passed through),
    loading + empty states, guarded expense-type labels (`types.*`, canonical enum
    stays English) + the split-rule description.
- [ ] **9. Migrate: landing + auth shell + nav.** Bilingual landing (Vercel-geo
  default). Neon Auth UI + OTP emails stay English (v1).
  - [x] **9a. landing** (`app/page.tsx` metadata + `marketing/landing-page`) →
    `landing` namespace: metadata (`generateMetadata`), nav/hero/steps/features/
    pricing/final-CTA/footer copy, and the hero preview's labels (illustrative
    figures stay literal). Arrays built in-component with literal `t()` keys.
  - [x] **9b. app nav** (`lib/nav` labels → stable `labelKey` into a `nav`
    namespace; `app-sidebar`, `app-header` breadcrumb, `settings-nav` resolve via
    literal-key records). Brand "Finance" stays literal.
  - [x] **9c. auth shell chrome** — N/A: `app/auth/[path]` renders only Neon Auth's
    `AuthView` with no app-owned copy (Neon Auth UI stays English v1), so nothing to
    migrate.
  - [x] **9d. bank-connection components** (ConnectBank, BankConnections + status
    labels, ConnectionAlerts reason copy, bank-sync-gate rich upgrade link,
    InitialSyncOnConnect plural, disconnect/reconnect buttons) → `bankSync`
    namespace: guarded status/reason switches, ICU `=0`/one/other import plural,
    `{bank}`-interpolated aria/messages.
- [ ] **10. Enforcement flip.** Blocking ESLint rule banning literal JSX strings in
  `app/**` + `components/**` (exclude API routes, `lib/`, tests, scripts, drizzle;
  ignore non-user-facing attrs); CI **key-parity** check (`keys(en) ≡ keys(is)`).
  Remove temporary disables. Verify lint fails on a planted hard-coded string.
