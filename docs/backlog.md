# Implementation Backlog

An ordered, dependency-aware decomposition of the architecture decisions in
[`docs/adr/`](./adr) into small, reviewable pieces. Each `- [ ]` item is intended to be
one small PR. Earliest items are pure domain logic in `shared/` (no infrastructure, ideal
for test-first work); later items add the database, auth, ingestion, the classification
pipeline, the dashboard, and finally billing.

Work top-down: take the first unchecked item whose dependencies are satisfied, build it
test-first (see the `tdd` workflow and `CONTEXT.md` for domain vocabulary), and check it
off in the same PR. If an item is too large to review in one sitting, split it and leave
the remainder as new unchecked items.

## Phase A — Pure domain logic (`shared/`, no infrastructure)

- [x] **Net math uses the charged amount only** (ADR-0004): net profit/loss sums the charged
  amount in the Account's billing currency; the foreign `original` amount is display-only and
  never summed. Guard against totalling mixed currencies.
- [x] **Row-fingerprint dedup** (ADR-0003): fingerprint = (date, amount, merchant, raw-category)
  plus an occurrence ordinal, so genuine same-day / same-price repeats both survive.
- [x] **Exact-file import guard** (ADR-0003): hash an upload's bytes and flag when the Household
  has already imported an identical file.
- [x] **Merchant-rule matching** (ADR-0005, `CONTEXT.md`): normalize the merchant (uppercase,
  trim, strip store-number / location); support flat (`merchant → type`) and amount-threshold
  split rules in deterministic shared logic that runs before AI classification. Keep this separate
  from the existing LLM classifier prompt in `shared/rules.ts`.
- [x] **Expense-type model + Free-cap counting** (ADR-0002, `CONTEXT.md`): credits and split
  payments map to `""` (not bucketed); the Free cap is 50 *distinct classified* Transactions,
  lifetime, per Household.
- [x] **Statement-cycle bucketing** (`CONTEXT.md`): replace or migrate the existing shared
  statement-cycle helper so the cutoff day is configurable, with **cutoff day `1` (calendar month)
  as the default**, applied uniformly to every Account by transaction date; cover the current
  27th–26th behavior as a configured (non-default) case.

## Phase B — Persistence: Neon Postgres

- [x] **Neon connection + migration tooling** (ADR-0001): environment wiring (EU region) and a
  migration runner.
- Schema (ADR-0002/0003/0005/0006) — every financial row keyed by `household_id`; append-only
  DB-generated PKs; `source_row` for traceability; `classification_status` (`pending` /
  `classified` / `failed`). Split into reviewable slices:
  - [x] **Schema: tenant & identity** — Household (+ Plan fields), Member (Stack auth link),
    Account (name, billing currency).
  - [x] **Schema: ingestion & classification** — Upload (file hash, importer), Transaction
    (append-only PK, `source_row`, amounts, `classification_status`, expense type), Override.
  - [x] **Schema: merchant rules** — MerchantRule (flat or amount-threshold split), per Household.
- [x] **Data-access layer** with `household_id` scoping enforced on every query.

## Phase C — Auth & tenancy: Neon Auth (Stack) — depends on B

- Neon Auth integration and session handling (ADR-0001). Split into reviewable slices:
  - [x] **Auth core + session** — Neon Auth SDK, server/client instances, `/api/auth` handler,
    server-side session helpers (`getCurrentUser`/`requireUser`).
  - [x] **Auth UI + route protection** — `NeonAuthUIProvider` + `UserButton` in the layout,
    sign-in pages (`AuthView`), and route-protection middleware (`proxy.ts`).
- [x] **Household provisioning**: one Household per user (v1), mapped to a Stack Team; membership;
  all Members equal (ADR-0002).
- [x] **Tenant guard**: every request resolves a `household_id`; no cross-household reads.

## Phase D — Ingestion (ADR-0003) — depends on B, C, and Phase A dedup/guard

- [x] **Upload endpoint**: accept a CSV plus column mapping and Account; run the exact-file guard;
  persist the Upload.
- [x] **Append rows**: parse → append Transactions (with dedup, `source_row`, status `pending`).

## Phase E — Classification pipeline (ADR-0005) — depends on D and Phase A rules

- [x] **Idempotent status model**: re-running classification skips already-classified rows.
- [x] **Rules-first pass**: rule-matched rows skip the model entirely.
- Background worker (ADR-0005) — drain `pending` through Sonnet 4.6, store per-row confidence +
  reasoning, crash-safe. Split into reviewable slices:
  - [x] **Worker drain orchestration** — `drainPending(repo, classifier)` with the model injected;
    credits not bucketed (no model call); per-row classify/markFailed; resumable; batch limit.
  - [x] **Sonnet 4.6 classifier (Vercel AI Gateway) + durable trigger** — real classifier calling
    `anthropic/claude-sonnet-4-6` via the AI Gateway with the rules prompt; durable drain trigger.
- [x] **Upload progress**: a polling endpoint plus a UI progress indicator.

## Phase F — Dashboard & overrides — depends on D, E, and Phase A cycle/net

- **Dashboard**: statement-cycle net profit/loss with a per-expense-type breakdown. Split:
  - [x] **Net-summary aggregation** — household-scoped income/expense/net plus a per-expense-type
    breakdown over a date range, with manual Overrides taking precedence over the classified type.
  - [x] **Dashboard UI** — page rendering the summary for the current statement cycle.
- **Override**: a manual expense-type change that takes precedence over the classified type. Split:
  - [x] **Set/clear endpoint** — `overrides.upsert`/`remove` repo methods + `PUT`/`DELETE
    /api/transactions/:id/override`, household-scoped.
  - [x] **Override UI** — an expense-type control on a transaction that calls the endpoint.
- **Merchant-rule management**. Split:
  - [x] **List/create/delete endpoint** — `GET`/`POST /api/merchant-rules` (flat or split, validated)
    + `DELETE /api/merchant-rules/:id`, household-scoped (`merchantRules.remove`).
  - [x] **Management UI** — list rules with delete + an add form, calling the endpoints.

## Phase G — Billing (ADR-0006) — depends on C and Phase A Free-cap counting

- [x] **Plan on Household** + Free-cap enforcement: reaching 50 pauses AI classification only;
  Uploads, dashboard, Overrides, and net tracking stay usable.
- **Straumur / Adyen**: tokenized card + initial charge (1990 ISK/month, or annually at −30%). Split:
  - [x] **Straumur primitives** — wire-amount, webhook field-normalize, and HMAC webhook verification.
  - [x] **Checkout session client + route** — `createSession`/`getSessionStatus` + a tokenized
    checkout-session endpoint (recurringProcessingModel: Subscription).
  - [x] **Payment webhook + records** — `POST /api/webhooks/straumur` (HMAC) + `straumur_payments`
    table; idempotent recording of Authorization events.
  - [x] **Premium activation** — on a successful Authorization, set the Household to Premium with a
    renewal date + the stored token (from the recorded event).
- **Renewal cron** + dunning / retry driven by payment webhooks. Split:
  - [x] **Recurring charge client + period** — `chargeStoredToken` (Pay-with-Token MIT) +
    `households.subscription_period` set on activation.
  - [x] **Renew route + cron** — due-for-renewal query + a secured `/api/billing/renew` that charges
    due households, run on a daily cron.
  - [x] **Dunning** — retry window on a failed charge, then downgrade to Free.
- [x] **In-app manage / cancel** subscription screen.

## Phase H — UI surfaces for existing APIs (gap-analysis follow-up) — tracer-bullet vertical slices

The loop (Phases A–G) shipped backend + components but left several APIs with no UI, and three
components unmounted. Each slice below is a thin end-to-end path (API→UI→tests), demoable on its
own, dependency-ordered. Adyen client Drop-in (Premium upgrade) is deferred to a later phase.

- [x] **Accounts API + management UI** — `GET`/`POST /api/accounts` (household-scoped, reusing
  `householdRepo.accounts`) and an `/accounts` page to list and add accounts, linked from the nav.
  Acceptance: a signed-in user can create an account and see it listed; duplicate-safe; tests cover
  the route (list/create/validation) and the page/form. Blocked by: none.
- [x] **Upload flow page** — an `/upload` page with an account selector + CSV file picker that posts
  to `POST /api/uploads` (multipart) and renders the existing `<UploadProgress>` for the created
  upload. Acceptance: a user picks an account + file, uploads, and sees progress; 4xx errors
  surface inline. Blocked by: Accounts API + management UI.
- [x] **Run classification from the UI** — kick `POST /api/classify` after a successful upload (and
  expose a manual "Classify pending" affordance), surfacing the returned counts. Acceptance:
  after an upload the user can trigger/observe classification without leaving the app. Blocked by:
  Upload flow page.
- [x] **Transactions list + inline overrides** — a transactions list (server-read via the
  household repo, scoped to the current statement cycle) that mounts `<OverrideControl>` per row so
  a user can change an expense type. Acceptance: transactions render with merchant/amount/type and
  an override control that persists; nav link added. Blocked by: none (works on any data).
- [x] **Merchant-rules management page** — a `/rules` page that mounts the existing
  `<MerchantRulesManager>`, linked from the nav. Acceptance: a user can view, add, and delete
  merchant rules from a real page. Blocked by: none.

## Phase I — Premium upgrade (Adyen Drop-in) — depends on Phase G billing

The server checkout route (`POST /api/billing/checkout`) already returns an Adyen Sessions payload
(`id` / `sessionData` / `clientKey`) for an embedded Drop-in, but the Free plan has no client upgrade
flow. This phase adds it. Premium activation itself stays webhook-driven (already built).

- [x] **Premium upgrade via Adyen Drop-in** — a client checkout: the Free plan shows an "Upgrade to
  Premium" affordance with a monthly/annual period choice (prices from `lib/billing/pricing`), which
  `POST`s `/api/billing/checkout`, then mounts the Adyen Web Drop-in (`@adyen/adyen-web`) with the
  returned session + `clientKey` (environment derived from the key prefix). Acceptance: a Free user
  can pick a period, see the Drop-in, and a completed payment shows confirmation; checkout/SDK errors
  surface inline. Blocked by: none (server route + webhook activation already shipped).
- [x] **Post-payment activation confirmation** — after the Drop-in reports completion, confirm
  Premium is active (poll `getSessionStatus` via a new status route and/or the household plan) so the
  UI reflects activation rather than assuming it. Acceptance: after paying, the user sees Premium
  active without a manual refresh. Blocked by: Premium upgrade via Adyen Drop-in.

## Phase J — Savings goals (ADR-0007) — depends on Phase A net + Phase F statement-cycle/net-summary

A Household sets a **Savings goal** (target amount by a target date) and checks in ~monthly, after
uploading a cycle's Transactions, to see if it is on track and how much `Nice to have` it can still
afford. Progress is *inferred* from spend, never an entered balance (ADR-0007). Dependency-ordered,
each item one small PR; earliest are pure `shared/` domain logic (test-first).

- [ ] **Savings math** (`shared/savings.ts`, ADR-0007): pure + test-first. `inferredSaving =
  monthlyIncome − offCardFixed − cardDebits` (debits = −Σ negative amounts; positive card lines
  ignored); cumulative = startingSaved + Σ snapshots; on-track baseline `(target−startingSaved) /
  totalCycles`; corrective pace `(target−cumulative) / cyclesRemaining`; `allowedNiceToHave =
  income − offCardFixed − correctivePace − expectedFixed − expectedNecessary`. Guard zero/negative
  cycles remaining. No infrastructure. Blocked by: none.
- [ ] **Schema: goal + config + check-ins** (ADR-0007, ADR-0002): `savings_goals` (target,
  targetDate, startingSaved, startCycle, currency; one active per Household), `savings_income_sources`
  (`{name, amount}`), `savings_offcard_costs` (`{name, monthlyAmount}`), `savings_checkins` (cycleKey
  + frozen income/offcard/cardDebits/inferredSaving + optional cycleExtra; unique(household, cycle)).
  Household-scoped, CHECK-constrained, composite same-household FKs. Blocked by: none.
- [ ] **Data-access** for the new tables: household-scoped repo methods — goal get/upsert, income
  sources + off-card costs list/replace, check-ins list + upsert-by-cycle. Blocked by: Schema.
- [ ] **Trailing-average estimator**: expected `Fixed`/`Necessary` from the last ~3 completed cycles'
  net summaries, with a manual fallback when history is thin. Pure logic + repo read. Blocked by:
  Data-access.
- [ ] **Goal + config API**: `GET`/`PUT /api/savings/goal` and `GET`/`PUT /api/savings/config`
  (income + off-card), household-scoped, validated. Blocked by: Data-access.
- [ ] **Check-in API**: `GET /api/savings/checkins` + `POST /api/savings/checkins` — freeze the
  current cycle from `loadNetSummary` + config and upsert by cycle; mark the Nice-to-have breakdown
  provisional when pending/failed rows exist. Blocked by: Savings math, Trailing-average estimator,
  Goal + config API.
- [ ] **Savings page + nav**: `/savings` — goal + config forms, current-cycle check-in view
  (on-track banner, Allowed nice-to-have, prescribe-when-behind), and check-in history; "Savings"
  nav item. Blocked by: Check-in API.
- [ ] **Dashboard progress card**: a compact wedding-fund progress card on the Dashboard linking to
  `/savings`. Blocked by: Savings page + nav.
