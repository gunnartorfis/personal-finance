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
- [ ] **Override UI**: a manual expense-type change that takes precedence over the classified type.
- [ ] **Merchant-rule management UI**.

## Phase G — Billing (ADR-0006) — depends on C and Phase A Free-cap counting

- [ ] **Plan on Household** + Free-cap enforcement: reaching 50 pauses AI classification only;
  Uploads, dashboard, Overrides, and net tracking stay usable.
- [ ] **Straumur / Adyen**: tokenized card + initial charge (1990 ISK/month, or annually at −30%).
- [ ] **Renewal cron** + dunning / retry driven by payment webhooks.
- [ ] **In-app manage / cancel** subscription screen.
