# Financial health: net worth from balance snapshots, runway, and savings rate

The dashboard (ADR-0008) answers *how much did we spend this cycle*, and the Savings goal (ADR-0007)
tracks progress toward one target. Neither answers the three questions a Household actually asks of
its finances: **are we turning a profit**, **how much can we realistically save each month**, and
**will we survive long-term**. We add a **Financial health** section that answers all three from
trailing, completed-cycle figures, plus the one piece of data the survival question needs — an
Account **balance** — which the app did not model at all.

**Profit and savings** are derived from data we already have. Over the trailing completed cycles
(the in-progress month is excluded, ADR-0021), we fold each cycle's resolved income / off-card cost
(ADR-0015) and card debits (ADR-0007, debits only) into: a **typical monthly saving** (trailing
average of `income − off-card − card debits`), a **savings rate** as a share of *gross* income, a
**monthly burn** (`off-card + card debits` — the outflow if income stopped), and a **profit streak**
(profitable N of the last M). These are trailing averages so a single lucky or unlucky month never
defines them; a thin-data gate hides them until there are enough completed cycles.

**Net worth and runway** need balances, so we introduce **append-only Account balance snapshots**:
each row is one observation of an Account's balance at a point in time, never updated in place. Net
worth is the sum of the **latest snapshot per Account**; runway is `net worth ÷ monthly burn` — how
many months the Household could coast if income stopped. Balances are entered manually now; because
the store is append-only, a future bank-balance sync just inserts rows on the same table with
`source = 'bank_sync'` and the same math holds. A balance **may be negative** — an overdraft or a
credit-card balance is real debt that reduces net worth.

Decisions taken: the **savings-rate denominator is gross income** (people know their income, not
always their fixed bills); **runway burn includes off-card fixed costs** (rent/loans are real drains
if income stops), not card spend alone; net worth **sums all Accounts** in v1 (no per-account
opt-out); progress toward the Savings goal stays **inferred, never entered** (ADR-0007) — a balance
snapshot is net worth, not savings-goal progress, and the two are deliberately kept separate.

## Considered Options

- **Derive net worth from transaction flows (no balance model)** — accumulate debits/credits from a
  known starting balance. Rejected: card statements are not the full financial picture (no cash,
  external accounts, or opening balance), so the running total drifts; a point-in-time balance is
  the honest source, and the eventual bank sync provides exactly that.
- **A single mutable `balance` column on `accounts`** — simplest. Rejected: it throws away history,
  so the net-worth projection and any "balance over time" view are impossible, and a bank sync
  overwriting it loses the manual context. Append-only snapshots keep the history for free.
- **Wait for bank-balance sync before shipping any of this** — no manual entry. Rejected: the
  profit/savings half needs no balances and ships immediately; manual entry unblocks net worth /
  runway now, and the sync becomes a second writer to the same table later, not a prerequisite.
- **Reuse Savings `startingSaved` as net worth** — Rejected: that is a goal input under ADR-0007's
  inferred-progress model; conflating an entered balance with inferred savings breaks that ADR.
- **Savings rate on income-after-fixed-costs** — a "spendable income" denominator. Rejected as the
  v1 default: it is only defined once off-card costs are configured, and users reason about gross
  income; revisit if the gross figure proves misleading.

## Consequences

- **New schema**: an append-only `account_balances` table (household-scoped, composite same-household
  FK to `accounts`, a `balance_source` enum, an `as_of` timestamp) with a latest-per-account index.
  No change to existing tables.
- **Net worth = latest snapshot per Account, summed** — Accounts without a snapshot contribute
  nothing; a Household with no snapshot at all has no net worth, and the net-worth / runway tiles are
  hidden until a balance is entered.
- **Runway and savings rate are trailing** and share the completed-cycle resolution the Savings math
  already uses (ADR-0015); they need no goal — they read the income/cost timelines directly.
- **Manual entry now, sync later**: balances are entered by a Member today. A future bank-balance
  sync inserts snapshots with `source = 'bank_sync'`; net worth automatically prefers the newest
  observation per Account regardless of source.
- **Negative balances are valid** and lower net worth; no non-negative constraint on `balance`.
- The Financial health section is **progressive**: profit/savings appear with enough cycle history;
  net worth/runway appear once a balance exists — each half degrades independently.
