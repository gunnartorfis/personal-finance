# Plan 001: Harden the Straumur webhook trust boundary (amount validation + first-seen token wins)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a1ed56c..HEAD -- app/api/webhooks/straumur/ lib/payments/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the paid-activation path; a too-strict check could reject legitimate payments — mitigated by "record always, gate only activation")
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a1ed56c`, 2026-07-04

## Why this matters

The Straumur payment webhook activates Premium for a Household. Its HMAC only signs
`[checkoutReference, payfacReference, merchantReference, amount, currency, reason, success]` —
NOT `additionalData`. Yet two security-relevant decisions read from the unsigned
`additionalData`: the `eventType === "Authorization"` gate, and
`recurringDetailReference` (the card token the renewal cron later charges unattended).
Additionally, activation never compares the signed `amount`/`currency` against the expected
plan price — the code in `lib/payments/straumur.ts` explicitly anticipates this
anti-tampering check ("so an anti-tampering check can apply the same transform to the
expected price") but it was never implemented. This plan adds two defense-in-depth guards:
(1) activate Premium only when the signed amount/currency match the expected plan price;
(2) on webhook re-delivery, the first-seen `recurringDetailReference` wins — a replayed
event with a mutated (unsigned) token cannot swap the stored card token.

Cross-household forgery is NOT possible today (`merchantReference` is signed and minted
server-side); this plan closes the residual paths that rely on unsigned fields.

## Current state

Files:

- `app/api/webhooks/straumur/route.ts` — the webhook route. HMAC verify at line 50; the
  unsigned `eventType` gate at lines 54–69; activation at lines 109–117:

  ```ts
  // route.ts:109-117
  const period = parsePeriodFromReference(merchantReference)
  if (success && householdId && period) {
    await activatePremiumFromAuthorization(db, {
      householdId,
      period,
      recurringDetailReference,
      now: recorded.createdAt,
    })
  }
  ```

  Note there is NO amount/currency check before `activatePremiumFromAuthorization`.
  `recurringDetailReference` comes from `extractRecurringDetailReference(additionalData)`
  (line 87) — unsigned data.

- `lib/payments/straumur-webhook.ts` — helpers. `extractRecurringDetailReference`
  (~line 36), `recordWebhookEvent` (upserts into `straumurPayments` keyed on
  `pspReference` with `onConflictDoUpdate`), and `activatePremiumFromAuthorization`
  (~line 100), which sets `plan: "Premium"`, `planRenewsAt`, `subscriptionPeriod`, and
  conditionally `straumurRecurringDetailReference` (only when non-null — "a later event
  missing it doesn't clear an earlier one").

- `lib/payments/straumur.ts` — `toStraumurWireAmount(value, currency)` at line 24:
  ISK is multiplied ×100 to Straumur's 2-decimal minor units ("must end in 00" rule,
  errorCode 2026). Its doc comment says it was normalised in one place *so that* an
  anti-tampering check can apply the same transform to the expected price.

- `lib/billing/pricing.ts` — `subscriptionPriceISK(period)`: `"monthly"` → 1990,
  `"annual"` → `Math.round(1990 * 12 * (1 - 0.3))` = 16716. Whole ISK.

- `app/api/webhooks/straumur/route.test.ts` — existing webhook tests; use as the
  structural pattern for new tests.

Conventions: JSDoc comments explaining *why* on exported functions; errors on the webhook
path return `accepted()` (the literal `"[accepted]"` body) for handled-but-dropped events,
400/500 only when Straumur should retry. Tests are colocated `*.test.ts`, Vitest, with
pglite for DB-backed tests (see `lib/db/household-repo.test.ts` for the pattern).

## Commands you will need

| Purpose   | Command                                    | Expected on success |
|-----------|--------------------------------------------|---------------------|
| Install   | `pnpm install`                             | exit 0              |
| Typecheck | `pnpm typecheck`                           | exit 0, no errors   |
| Tests     | `pnpm test:run app/api/webhooks/straumur lib/payments` | all pass |
| Full tests| `pnpm test:run`                            | all pass            |
| Lint      | `pnpm lint`                                | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `app/api/webhooks/straumur/route.ts`
- `app/api/webhooks/straumur/route.test.ts`
- `lib/payments/straumur-webhook.ts`
- `lib/payments/straumur-webhook.test.ts` (if it exists; create otherwise)

**Out of scope** (do NOT touch, even though they look related):
- `lib/payments/straumur.ts` — the HMAC verifier and checkout client are correct; you only
  *call* `toStraumurWireAmount` from the route.
- `app/api/billing/renew/route.ts` — the renewal cron has its own flow; do not add checks there.
- `lib/billing/pricing.ts` — prices are correct; you only call `subscriptionPriceISK`.
- The signing-string composition — `additionalData` cannot be added to it; that is
  Straumur's (Adyen's) wire contract, not ours.

## Git workflow

- Branch: `advisor/001-straumur-webhook-trust-hardening` off fresh `main`
- Conventional commits, e.g. `fix(billing): gate Premium activation on signed amount/currency`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Gate activation on the signed amount and currency

In `app/api/webhooks/straumur/route.ts`, before calling
`activatePremiumFromAuthorization`, compute the expected wire amount and require a match:

```ts
import { toStraumurWireAmount } from "@/lib/payments/straumur" // extend existing import
import { subscriptionPriceISK } from "@/lib/billing/pricing"

// inside POST, replacing the `if (success && householdId && period)` guard:
const period = parsePeriodFromReference(merchantReference)
if (success && householdId && period) {
  const expected = toStraumurWireAmount(subscriptionPriceISK(period), "ISK")
  if (amount === expected.amount && currency === expected.currency) {
    await activatePremiumFromAuthorization(db, { ... }) // unchanged args for now; step 2 changes one
  } else {
    // Signed fields, so a mismatch is a mis-priced charge or a tampered flow — record
    // (already done above) but never activate on it; keep it observable.
    console.error(
      `[straumur-webhook] amount mismatch: got ${amount} ${currency}, expected ${expected.amount} ${expected.currency} (psp=${pspReference})`,
    )
  }
}
```

Still return `accepted()` for the mismatch case (the event is recorded; a 4xx would make
Straumur retry forever). Keep the existing comment style — explain *why* activation is
gated, referencing that amount/currency are HMAC-signed.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: First-seen recurringDetailReference wins on re-delivery

`recordWebhookEvent` upserts on `pspReference`. Change it so that when the row already
exists (a re-delivery/replay of the same event) an incoming `recurringDetailReference`
that *differs* from the first-seen one is ignored and logged, and the function returns the
stored (first-seen) value. Then in `route.ts`, pass the *returned* token into
`activatePremiumFromAuthorization` instead of the freshly parsed one:

- In `lib/payments/straumur-webhook.ts`, have `recordWebhookEvent` return (in addition to
  whatever it returns today — check the existing return, it at least yields `createdAt`)
  the effective `recurringDetailReference` after the first-seen-wins rule.
- Implementation approach: in the `onConflictDoUpdate`, exclude
  `recurringDetailReference` from the updated columns (so the stored value is never
  overwritten by a replay), and after the upsert read the row's stored value to return.
  Log a `console.warn` when the incoming value is non-null and differs from the stored one.
- A *new* pspReference (fresh event, e.g. a card-update Authorization from a new checkout)
  stores and returns its own token — this must keep working; card updates arrive as new
  events, not replays.
- In `route.ts`, use `recorded.recurringDetailReference` in the activation call.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Tests

Extend `app/api/webhooks/straumur/route.test.ts` (and the webhook helper test file),
modeled on the existing tests there:

1. Authorization with correct amount (monthly: `199000` wire, `"ISK"`) → household becomes
   Premium. (Likely already covered — if the existing fixtures use the real price, they
   keep passing; if they use a fake price, update the fixtures to the real one.)
2. Authorization with wrong amount (e.g. wire `100`) → event recorded in
   `straumur_payments`, household stays Free, response is `[accepted]`.
3. Authorization with wrong currency (e.g. `"EUR"` with matching number) → same as (2).
4. Annual period reference with the annual price (`1671600` wire) → activates.
5. Re-delivered event (same `pspReference`) carrying a *different*
   `recurringDetailReference` → stored token unchanged (first-seen wins), household token
   unchanged.
6. New pspReference with a new token → token updates (card-update path preserved).

**Verify**: `pnpm test:run app/api/webhooks/straumur lib/payments` → all pass, including
the 5–6 new tests.

## Test plan

Covered in Step 3. Pattern: `app/api/webhooks/straumur/route.test.ts` (existing HMAC-signed
fixture construction — reuse its signing helper so fixtures stay verifiable).

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test:run` exits 0; new tests for amount mismatch + token replay exist and pass
- [ ] `pnpm lint` exits 0
- [ ] In `route.ts`, `activatePremiumFromAuthorization` is unreachable without an
      amount+currency match (read the diff to confirm)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The live code no longer matches the "Current state" excerpts (drift).
- Existing webhook tests fail because their fixtures use amounts that the new check rejects
  AND updating the fixture to the real price (`toStraumurWireAmount(subscriptionPriceISK(period), "ISK")`)
  does not fix them — that suggests the wire-amount contract differs from this plan's understanding.
- You find evidence (comments, tests, docs) that Straumur sends legitimate Authorization
  events at amounts other than the plan price (prorations, discounts, retries at partial
  amounts). The amount gate would break those — report instead of loosening the check yourself.
- Implementing step 2 requires changing the `straumur_payments` schema — schema migrations
  are out of scope for this plan.

## Maintenance notes

- If pricing ever changes (new tiers, promo pricing), the expected-amount check in the
  webhook must learn the new prices — grep for `subscriptionPriceISK` call sites.
- Reviewer should scrutinize: the mismatch branch must still return `[accepted]` (Adyen
  retries anything else for ~8 days), and the recorded row must still be written before the
  gate so mismatches are observable in `straumur_payments`.
- Deferred (why): making Straumur sign `additionalData` is not in our control; opting in
  Refund/Cancellation event handling is a separate feature (route comment already notes it).
