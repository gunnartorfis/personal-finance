# Shared expense: counting only the Household's Own share

A Member can mark a debit Transaction as a **Shared expense** — the Household fronted
one charge for several parties and only bears part of it (e.g. a 200,000 ISK group gift
split across seven couples; the Household's share is ~28,571). Only the **Own share**
counts as Spending; the remainder drops from all math exactly as if **Excluded**. The
incoming paybacks need no handling: as unmarked credits they already count for nothing
(ADR-0009), so nothing double-counts.

This generalises ADR-0011. Excluded takes a debit fully out of the math (share of zero);
a Shared expense takes it *partially* out. Persisted as one nullable
`transactions.own_share_amount` (integer, whole billing-currency units, **negative** like
`amount`), plus a Postgres STORED generated column
`effective_amount = coalesce(own_share_amount, amount)`.

DB CHECKs: `own_share_amount` is set only when `amount < 0` (debit-only); bounded
`amount <= own_share_amount < 0` (a real, nonzero expense no larger than the charge — a
share of zero is Excluded, a share equal to `amount` is a UI-prevented no-op); and
mutually exclusive with `excluded` (`NOT (own_share_amount IS NOT NULL AND excluded)`).
Excluding clears the share, symmetric with how excluding clears `income_marked` today.

## Considered Options

- **Split into N child Transactions** — rejected. The card shows one line; children would
  break append-only provenance (ADR-0003), the `source`/`sourceRow`/`externalId`
  provenance CHECK, and synced-row dedup. Own share keeps one row and only shrinks its
  effective magnitude.
- **Store a divisor (÷N) instead of a resolved amount** — rejected. Can't express uneven
  splits ("I'll cover a bit extra"), and forces a rounding rule into every read path
  forever. Storing the resolved integer pushes rounding to input time, once; the remainder
  is derivable (`amount − own_share_amount`).
- **Track who owes what / expected repayments** — rejected for v1. That is transfer
  matching (issue #97), which ADR-0011 already defers. ADR-0009 makes the credit leg a
  no-op, so only the debit magnitude needs adjusting.
- **A STORED generated `effective_amount` vs. scattered `coalesce` in each query** —
  chose the generated column. The spend aggregations are ~7 separate SQL sums in
  `household-repo.ts`; a single DB-computed column is the one greppable, drift-proof choke
  point. Because `own_share_amount` is null except on shared debits,
  `effective_amount ≡ amount` everywhere else, so switching a spend query to it is safe.
- **Substitute Own share everywhere `amount` is read** — rejected. Own share answers "how
  much did *we* spend," not "what/how big is this charge." So classification input,
  **Merchant rule** matching (including the `≥ threshold` split), the review queue, and the
  transaction list's displayed face value deliberately keep raw `amount`; only net summary,
  the Spending series, movers, top-merchants, category-trend, and account-breakdown read
  `effective_amount`.

## Consequences

- **Own share changes how much counts as spend; it never changes what kind of charge it is
  or its displayed face value.** The list still shows 200,000 (with a "your share" annotation);
  a merchant rule keyed at ≥50,000 still judges the real 200,000.
- Savings needs no separate wiring: Inferred saving reads the same monthly Spending series
  as the dashboard (`assessment.ts` ← `household-repo.ts` spending sum), so switching that
  series to `effective_amount` corrects savings automatically. A Shared expense therefore
  *raises* Inferred saving relative to charging the full amount.
- The reconciliation invariant `sum(byExpenseType) + unclassified === expense` holds because
  every consumer of the expense side uses `effective_amount` consistently.
- A Shared expense is bucketed by its normal effective Expense type; only the Own-share
  magnitude lands in the bucket. This retires the pre-existing "shared/split payments are
  unbucketed (`""`)" guidance — `""` now means credits only.
- Orthogonal to Classification and Free-cap: setting a share never changes classification
  status, Expense type, Override, or Free-cap counting (one row = one classification), so it
  is cleanly reversible and can't reclaim quota.
- Live views recompute from rows, so setting a share retroactively changes a past cycle's
  dashboard — but a recorded **Check-in** snapshot is frozen and untouched (as with Excluded).
- v1 is entirely manual — no auto-detection, and no per-party tracking or settle-up.
